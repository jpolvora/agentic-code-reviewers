import type { CodeReviewResponse, DeveloperAction, ResolvedThreadItem, ReviewSeverity } from '../ado/types.js';

const JSON_FENCE_OPEN = /```(?:json)?\s*/gi;
const JSON_STRING_ESCAPES = new Set(['"', '\\', '/', 'b', 'f', 'n', 'r', 't', 'u']);

/** Tenta parsear como JSON, com fallback de sanitização de aspas/quebras. */
function tryParseJson(candidate: string): unknown | undefined {
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(cleanJsonString(candidate));
    } catch {
      return undefined;
    }
  }
}

/**
 * After an opening ``` / ```json fence, take the first balanced `{...}` object.
 * Nested ``` inside suggestedFix strings must not truncate the candidate.
 */
function extractBalancedJsonAfterFence(text: string, contentStart: number): string | null {
  let i = contentStart;
  while (i < text.length && /\s/.test(text[i]!)) i++;
  if (text[i] !== '{') return null;
  const objects = extractTopLevelJsonObjects(text.slice(i));
  return objects[0] ?? null;
}

/**
 * Varre `text` e retorna todos os objetos JSON de nível superior (`{...}`)
 * via contagem de chaves balanceadas, respeitando strings e escapes.
 * Custo O(n) — uma única passada pela string.
 */
function extractTopLevelJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
    } else if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

export function extractJsonFromAgentOutput(text: string): string | null {
  // 1. Prefer the last fenced ``` / ```json block whose first balanced `{...}` parses.
  //    Brace-balanced (not non-greedy ```) so nested fences in suggestedFix survive.
  const fenceCandidates: string[] = [];
  JSON_FENCE_OPEN.lastIndex = 0;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = JSON_FENCE_OPEN.exec(text)) !== null) {
    const candidate = extractBalancedJsonAfterFence(text, fenceMatch.index + fenceMatch[0].length);
    if (candidate) fenceCandidates.push(candidate);
  }
  for (let i = fenceCandidates.length - 1; i >= 0; i--) {
    const candidate = fenceCandidates[i]!;
    if (tryParseJson(candidate) !== undefined) {
      return candidate;
    }
  }

  // 2. Fallback: varrer objetos `{...}` de nível superior (stdout com logs/JSON
  //    duplicado) e escolher o ÚLTIMO objeto válido — preferindo os que têm `reviews`.
  const candidates = extractTopLevelJsonObjects(text);
  let lastValid: string | null = null;
  let lastWithReviews: string | null = null;
  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate);
    if (parsed === undefined) continue;
    lastValid = candidate;
    if (parsed && typeof parsed === 'object' && 'reviews' in (parsed as object)) {
      lastWithReviews = candidate;
    }
  }

  return lastWithReviews ?? lastValid;
}

export function escapeQuotesInJson(str: string): string {
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
          if (
            afterQuote.startsWith(',') ||
            afterQuote.startsWith('}') ||
            afterQuote.startsWith(']')
          ) {
            break;
          }
        }

        const char = str[i];
        if (char === '"') {
          if (valSegment.endsWith('\\')) {
            valSegment += '"';
          } else {
            valSegment += '\\"';
          }
        } else {
          valSegment += char;
        }
        i++;
      }

      result += valSegment + '"';
      i++;
    } else {
      result += str[i];
      i++;
    }
  }
  return result;
}

export function sanitizeJsonString(str: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (inString) {
      if (escaped) {
        result += char;
        escaped = false;
      } else if (char === '\\') {
        result += char;
        escaped = true;
      } else if (char === '"') {
        result += char;
        inString = false;
      } else if (char === '\n') {
        result += '\\n';
      } else if (char === '\r') {
        result += '\\r';
      } else if (char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
    } else {
      result += char;
      if (char === '"') {
        inString = true;
      }
    }
  }
  return result;
}

/**
 * LLMs often emit invalid JSON escapes inside suggestedFix (e.g. \` \. \: \' ).
 * Drop the backslash and keep the following character so JSON.parse can succeed.
 * Incomplete \uXXXX sequences are treated the same way.
 */
export function fixInvalidJsonEscapes(str: string): string {
  let result = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i]!;

    if (!inString) {
      result += char;
      if (char === '"') inString = true;
      continue;
    }

    if (escaped) {
      escaped = false;
      if (char === 'u') {
        const hex = str.slice(i + 1, i + 5);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          result += `\\u${hex}`;
          i += 4;
        } else {
          result += char;
        }
        continue;
      }
      if (JSON_STRING_ESCAPES.has(char)) {
        result += `\\${char}`;
      } else {
        result += char;
      }
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = false;
    }
    result += char;
  }

  if (escaped) {
    result += '\\';
  }

  return result;
}

export function cleanJsonString(str: string): string {
  const fixedEscapes = fixInvalidJsonEscapes(str);
  const escaped = escapeQuotesInJson(fixedEscapes);
  const sanitized = sanitizeJsonString(escaped);
  return sanitized.replace(/,(\s*[\]}])/g, '$1');
}

export function parseAgentReviewOutput(text: string): CodeReviewResponse {
  const jsonText = extractJsonFromAgentOutput(text);
  if (!jsonText) {
    if (/sem feedback/i.test(text)) {
      return { reviews: [], resolvedThreads: [], reviewSummary: 'Revisão concluída sem apontamentos.' };
    }
    throw new Error(`Resposta do agente não contém bloco JSON com reviews.\n\n[Debug] Raw Agent Response:\n${text}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    try {
      parsed = JSON.parse(cleanJsonString(jsonText));
    } catch (error) {
      throw new Error(`JSON inválido na resposta do agente: ${String(error)}\n\n[Debug] Raw JSON text that failed to parse:\n${jsonText}`);
    }
  }

  return normalizeCodeReviewResponse(parsed);
}

function normalizeCodeReviewResponse(raw: unknown): CodeReviewResponse {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Resposta JSON do agente não é um objeto.');
  }

  const obj = raw as Record<string, unknown>;
  if (obj.reviews != null && !Array.isArray(obj.reviews)) {
    throw new Error(
      `Campo "reviews" deve ser um array; recebido ${typeof obj.reviews}. Resposta do agente malformada.`,
    );
  }
  const reviews = Array.isArray(obj.reviews) ? obj.reviews.map(normalizeReviewItem) : [];
  const resolvedThreads: ResolvedThreadItem[] = Array.isArray(obj.resolvedThreads)
    ? obj.resolvedThreads
        .map((item): ResolvedThreadItem | null => {
          if (!item || typeof item !== 'object') return null;
          const record = item as Record<string, unknown>;
          const threadId = record.threadId != null ? Number(record.threadId) : undefined;
          const fileName = record.fileName ? String(record.fileName).trim() : undefined;
          const lineNumber = record.lineNumber != null ? Number(record.lineNumber) : undefined;
          const note = record.note ? String(record.note) : '';
          if (threadId && !Number.isNaN(threadId)) return { threadId, note };
          if (fileName && lineNumber && lineNumber > 0) return { fileName, lineNumber, note };
          return null;
        })
        .filter((item): item is ResolvedThreadItem => item !== null)
    : [];

  const reviewSummary = obj.reviewSummary != null ? String(obj.reviewSummary) : '';

  return { reviews, resolvedThreads, reviewSummary };
}

function normalizeDeveloperAction(record: Record<string, unknown>): DeveloperAction | undefined {
  const raw = record.developerAction ?? record.recommendedAction;
  if (!raw) return undefined;
  const value = String(raw) as DeveloperAction;
  if (['fix-code', 'resolve-comment', 'escalate'].includes(value)) {
    return value;
  }
  return undefined;
}

function normalizeReviewItem(item: unknown) {
  if (!item || typeof item !== 'object') {
    throw new Error('Item de review inválido na resposta do agente.');
  }

  const record = item as Record<string, unknown>;
  const rawSeverity = String(record.severity ?? 'warning').toLowerCase();
  const severity = (['critical', 'warning', 'suggestion'].includes(rawSeverity)
    ? rawSeverity
    : 'warning') as ReviewSeverity;

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
          .map((occ): { fileName: string; lineNumber: number } | null => {
            if (!occ || typeof occ !== 'object') return null;
            const r = occ as Record<string, unknown>;
            const fn = String(r.fileName ?? '').trim();
            const ln = Number(r.lineNumber ?? 0);
            if (fn && Number.isFinite(ln) && ln > 0) {
              return { fileName: fn, lineNumber: Math.trunc(ln) };
            }
            return null;
          })
          .filter((occ): occ is { fileName: string; lineNumber: number } => occ !== null)
      : undefined,
  };
}
