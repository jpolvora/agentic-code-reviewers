const JSON_BLOCK_PATTERN = /```(?:json)?\s*([\s\S]*?)```/i;
/** Tenta parsear como JSON, com fallback de sanitização de aspas/quebras. */
function tryParseJson(candidate) {
    try {
        return JSON.parse(candidate);
    }
    catch {
        try {
            return JSON.parse(cleanJsonString(candidate));
        }
        catch {
            return undefined;
        }
    }
}
/**
 * Varre `text` e retorna todos os objetos JSON de nível superior (`{...}`)
 * via contagem de chaves balanceadas, respeitando strings e escapes.
 * Custo O(n) — uma única passada pela string.
 */
function extractTopLevelJsonObjects(text) {
    const objects = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escaped = false;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            }
            else if (char === '\\') {
                escaped = true;
            }
            else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
        }
        else if (char === '{') {
            if (depth === 0)
                start = i;
            depth++;
        }
        else if (char === '}' && depth > 0) {
            depth--;
            if (depth === 0 && start !== -1) {
                objects.push(text.slice(start, i + 1));
                start = -1;
            }
        }
    }
    return objects;
}
export function extractJsonFromAgentOutput(text) {
    // 1. Preferir o último bloco fenced ```json válido.
    const matches = Array.from(text.matchAll(new RegExp(JSON_BLOCK_PATTERN, 'gi')));
    for (let i = matches.length - 1; i >= 0; i--) {
        const candidate = matches[i][1].trim();
        if (tryParseJson(candidate) !== undefined) {
            return candidate;
        }
    }
    // 2. Fallback: varrer objetos `{...}` de nível superior (stdout com logs/JSON
    //    duplicado) e escolher o ÚLTIMO objeto válido — preferindo os que têm `reviews`.
    const candidates = extractTopLevelJsonObjects(text);
    let lastValid = null;
    let lastWithReviews = null;
    for (const candidate of candidates) {
        const parsed = tryParseJson(candidate);
        if (parsed === undefined)
            continue;
        lastValid = candidate;
        if (parsed && typeof parsed === 'object' && 'reviews' in parsed) {
            lastWithReviews = candidate;
        }
    }
    return lastWithReviews ?? lastValid;
}
export function escapeQuotesInJson(str) {
    let result = '';
    let i = 0;
    while (i < str.length) {
        const match = str.slice(i).match(/^"([a-zA-Z0-9_-]+)"\s*:\s*"/);
        if (match) {
            const key = match[1];
            result += `"${key}": "`;
            i += match[0].length;
            let valSegment = '';
            while (i < str.length) {
                const rest = str.slice(i);
                if (rest.startsWith('"')) {
                    const afterQuote = rest.slice(1).trimStart();
                    if (afterQuote.startsWith(',') ||
                        afterQuote.startsWith('}') ||
                        afterQuote.startsWith(']')) {
                        break;
                    }
                }
                const char = str[i];
                if (char === '"') {
                    if (valSegment.endsWith('\\')) {
                        valSegment += '"';
                    }
                    else {
                        valSegment += '\\"';
                    }
                }
                else {
                    valSegment += char;
                }
                i++;
            }
            result += valSegment + '"';
            i++;
        }
        else {
            result += str[i];
            i++;
        }
    }
    return result;
}
export function sanitizeJsonString(str) {
    let result = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (inString) {
            if (escaped) {
                result += char;
                escaped = false;
            }
            else if (char === '\\') {
                result += char;
                escaped = true;
            }
            else if (char === '"') {
                result += char;
                inString = false;
            }
            else if (char === '\n') {
                result += '\\n';
            }
            else if (char === '\r') {
                result += '\\r';
            }
            else if (char === '\t') {
                result += '\\t';
            }
            else {
                result += char;
            }
        }
        else {
            result += char;
            if (char === '"') {
                inString = true;
            }
        }
    }
    return result;
}
export function cleanJsonString(str) {
    const escaped = escapeQuotesInJson(str);
    const sanitized = sanitizeJsonString(escaped);
    return sanitized.replace(/,(\s*[\]}])/g, '$1');
}
export function parseAgentReviewOutput(text) {
    const jsonText = extractJsonFromAgentOutput(text);
    if (!jsonText) {
        if (/sem feedback/i.test(text)) {
            return { reviews: [], resolvedThreads: [], reviewSummary: 'Revisão concluída sem apontamentos.' };
        }
        throw new Error(`Resposta do agente não contém bloco JSON com reviews.\n\n[Debug] Raw Agent Response:\n${text}`);
    }
    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    }
    catch {
        try {
            parsed = JSON.parse(cleanJsonString(jsonText));
        }
        catch (error) {
            throw new Error(`JSON inválido na resposta do agente: ${String(error)}\n\n[Debug] Raw JSON text that failed to parse:\n${jsonText}`);
        }
    }
    return normalizeCodeReviewResponse(parsed);
}
function normalizeCodeReviewResponse(raw) {
    if (!raw || typeof raw !== 'object') {
        throw new Error('Resposta JSON do agente não é um objeto.');
    }
    const obj = raw;
    if (obj.reviews != null && !Array.isArray(obj.reviews)) {
        throw new Error(`Campo "reviews" deve ser um array; recebido ${typeof obj.reviews}. Resposta do agente malformada.`);
    }
    const reviews = Array.isArray(obj.reviews) ? obj.reviews.map(normalizeReviewItem) : [];
    const resolvedThreads = Array.isArray(obj.resolvedThreads)
        ? obj.resolvedThreads
            .map((item) => {
            if (!item || typeof item !== 'object')
                return null;
            const record = item;
            const threadId = record.threadId != null ? Number(record.threadId) : undefined;
            const fileName = record.fileName ? String(record.fileName).trim() : undefined;
            const lineNumber = record.lineNumber != null ? Number(record.lineNumber) : undefined;
            const note = record.note ? String(record.note) : '';
            if (threadId && !Number.isNaN(threadId))
                return { threadId, note };
            if (fileName && lineNumber && lineNumber > 0)
                return { fileName, lineNumber, note };
            return null;
        })
            .filter((item) => item !== null)
        : [];
    const reviewSummary = obj.reviewSummary != null ? String(obj.reviewSummary) : '';
    return { reviews, resolvedThreads, reviewSummary };
}
function normalizeDeveloperAction(record) {
    const raw = record.developerAction ?? record.recommendedAction;
    if (!raw)
        return undefined;
    const value = String(raw);
    if (['fix-code', 'resolve-comment', 'escalate'].includes(value)) {
        return value;
    }
    return undefined;
}
function normalizeReviewItem(item) {
    if (!item || typeof item !== 'object') {
        throw new Error('Item de review inválido na resposta do agente.');
    }
    const record = item;
    const rawSeverity = String(record.severity ?? 'warning').toLowerCase();
    const severity = (['critical', 'warning', 'suggestion'].includes(rawSeverity)
        ? rawSeverity
        : 'warning');
    const lineNumber = Number(record.lineNumber ?? 0);
    const score = record.score != null ? Number(record.score) : undefined;
    return {
        fileName: String(record.fileName ?? '').trim(),
        lineNumber: Number.isFinite(lineNumber) ? Math.trunc(lineNumber) : 0,
        severity,
        comment: String(record.comment ?? '').trim(),
        score: score != null && Number.isFinite(score) ? score : undefined,
        developerAction: normalizeDeveloperAction(record),
        analysis: record.analysis ? String(record.analysis).trim() : undefined,
        impactPaths: Array.isArray(record.impactPaths)
            ? record.impactPaths.map(String).map((path) => path.trim()).filter((path) => path.length > 0)
            : undefined,
        suggestedFix: record.suggestedFix ? String(record.suggestedFix).trim() : undefined,
        relatedOccurrences: Array.isArray(record.relatedOccurrences)
            ? record.relatedOccurrences
                .map((occ) => {
                if (!occ || typeof occ !== 'object')
                    return null;
                const r = occ;
                const fn = String(r.fileName ?? '').trim();
                const ln = Number(r.lineNumber ?? 0);
                if (fn && Number.isFinite(ln) && ln > 0) {
                    return { fileName: fn, lineNumber: Math.trunc(ln) };
                }
                return null;
            })
                .filter((occ) => occ !== null)
            : undefined,
    };
}
//# sourceMappingURL=review-response.js.map