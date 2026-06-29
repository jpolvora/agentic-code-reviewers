import { matchesGlob } from '../project/rules-map.js';
import { isLineInChangedDiff, parseChangedLinesFromDiff } from '../git/diff-lines.js';
export const DEFAULT_PROTECTED_PATTERNS = [
    '.github/workflows/**',
    '.github/actions/**',
    'azure-pipelines*.yml',
    '**/azure-pipelines/**',
    'package.json',
    '**/package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'go.mod',
    'go.sum',
    'Cargo.toml',
    'composer.json',
    'composer.lock',
    'Dockerfile*',
    'docker-compose*',
    '.env*',
];
export const DEFAULT_MAX_COMMENT_CHARS = 8000;
const SECRET_PATTERNS = [
    /AKIA[0-9A-Z]{16}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bghp_[A-Za-z0-9]{20,}\b/,
    /\bgho_[A-Za-z0-9]{20,}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
    /\bsk-[A-Za-z0-9]{20,}\b/,
    /\bcursor_[A-Za-z0-9]{20,}\b/i,
];
const DANGEROUS_MARKDOWN_PATTERNS = [
    /<script\b/i,
    /javascript:/i,
    /\bonerror\s*=/i,
    /<iframe\b/i,
];
function hasAnalysisStructure(analysis) {
    const text = analysis.trim();
    if (!text)
        return false;
    const hasEvidence = /1\.\s*\*{0,2}\s*Evidence/i.test(text);
    const hasScenario = /2\.\s*\*{0,2}\s*Scenario/i.test(text);
    const hasProtection = /3\.\s*\*{0,2}\s*Protection/i.test(text);
    const hasDiscard = /4\.\s*\*{0,2}\s*Discards?/i.test(text);
    return hasEvidence && hasScenario && hasProtection && hasDiscard;
}
function severityScoreRange(severity, scoreMin) {
    switch (severity) {
        case 'critical':
            return { min: Math.max(9, scoreMin), max: 10 };
        case 'warning':
            return { min: scoreMin, max: 8 };
        case 'suggestion':
            return { min: scoreMin, max: 7 };
        default:
            return { min: scoreMin, max: 10 };
    }
}
function extractPathLikeTokens(text) {
    const tokens = [];
    const patterns = [
        /(?:^|[\s"'`(])([./]?[\w@.-]+(?:\/[\w@.*-]+)+\.[\w]+)/g,
        /(?:^|[\s"'`(])([./]?\.github\/[\w@./-]+)/g,
        /(?:^|[\s"'`(])(Dockerfile[\w.-]*)/g,
        /(?:^|[\s"'`(])(docker-compose[\w.-]*)/g,
        /(?:^|[\s"'`(])(\.env[\w.-]*)/g,
    ];
    for (const pattern of patterns) {
        let match;
        while ((match = pattern.exec(text)) !== null) {
            tokens.push(match[1]);
        }
    }
    return tokens;
}
function matchesProtectedPattern(path, patterns) {
    const normalized = path.replace(/\\/g, '/').replace(/^\//, '');
    for (const pattern of patterns) {
        if (matchesGlob(normalized, pattern) || matchesGlob(`/${normalized}`, pattern)) {
            return true;
        }
    }
    return false;
}
function collectReviewPaths(review) {
    const paths = [review.fileName, ...(review.impactPaths ?? [])];
    const textFields = [review.comment, review.analysis, review.suggestedFix ?? ''].join('\n');
    paths.push(...extractPathLikeTokens(textFields));
    return paths.filter((p) => p?.trim());
}
function containsSecretPattern(text) {
    return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}
function containsDangerousMarkdown(text) {
    return DANGEROUS_MARKDOWN_PATTERNS.some((pattern) => pattern.test(text));
}
/** Deterministic safe-output check for a single review item. */
export function checkSafeReview(review, options) {
    if (!options.enabled) {
        return { safe: true };
    }
    const combinedText = [review.comment, review.analysis, review.suggestedFix ?? ''].join('\n');
    if (containsDangerousMarkdown(combinedText)) {
        return { safe: false, reason: 'dangerous-markdown', detail: 'HTML/script injection pattern detected' };
    }
    if (containsSecretPattern(combinedText)) {
        return { safe: false, reason: 'secret-pattern', detail: 'Credential-like pattern detected in output' };
    }
    const maxChars = options.maxCommentChars;
    if ((review.comment?.length ?? 0) > maxChars || (review.analysis?.length ?? 0) > maxChars) {
        return { safe: false, reason: 'size-limit', detail: `Field exceeds ${maxChars} characters` };
    }
    if (review.suggestedFix && review.suggestedFix.length > maxChars * 2) {
        return { safe: false, reason: 'size-limit', detail: `suggestedFix exceeds ${maxChars * 2} characters` };
    }
    if (!hasAnalysisStructure(review.analysis ?? '')) {
        return {
            safe: false,
            reason: 'analysis-structure',
            detail: 'analysis must contain 4 numbered sections (1. Evidence, 2. Scenario, 3. Protection, 4. Discards)',
        };
    }
    const range = severityScoreRange(review.severity, options.scoreMin);
    if (typeof review.score === 'number' &&
        (review.score < range.min || review.score > range.max)) {
        return {
            safe: false,
            reason: 'severity-score',
            detail: `severity ${review.severity} requires score ${range.min}–${range.max}, got ${review.score}`,
        };
    }
    for (const path of collectReviewPaths(review)) {
        if (matchesProtectedPattern(path, options.protectedPatterns)) {
            return {
                safe: false,
                reason: 'protected-path',
                detail: `references protected path: ${path}`,
            };
        }
    }
    if (options.requireDiffLine &&
        options.changedLines.size > 0 &&
        !isLineInChangedDiff(options.changedLines, review.fileName, review.lineNumber)) {
        return {
            safe: false,
            reason: 'diff-line',
            detail: `${review.fileName}:${review.lineNumber} is not on a changed line in the diff`,
        };
    }
    return { safe: true };
}
export function isSafeReview(review, options) {
    return checkSafeReview(review, options).safe;
}
export function filterSafeOutputs(reviews, options) {
    if (!options.enabled) {
        return reviews;
    }
    const kept = [];
    const rejected = [];
    for (const review of reviews) {
        const result = checkSafeReview(review, options);
        if (result.safe) {
            kept.push(review);
        }
        else {
            rejected.push({ review, result });
        }
    }
    if (rejected.length > 0) {
        console.warn(`Safe Outputs: ${rejected.length} review(s) descartado(s) — ` +
            rejected
                .map(({ review, result }) => `${review.fileName}:${review.lineNumber} (${result.reason}: ${result.detail})`)
                .join('; '));
    }
    return kept;
}
export function buildSafeOutputOptions(config, diffText) {
    return {
        enabled: config.safeOutputs,
        requireDiffLine: config.requireDiffLine,
        maxCommentChars: config.maxCommentChars,
        protectedPatterns: config.protectedPatterns,
        changedLines: parseChangedLinesFromDiff(diffText),
        scoreMin: config.scoreMin,
    };
}
export function buildDefaultProtectedPatterns(extraCsv) {
    const patterns = [...DEFAULT_PROTECTED_PATTERNS];
    if (extraCsv?.trim()) {
        for (const part of extraCsv.split(',')) {
            const trimmed = part.trim();
            if (trimmed && !patterns.includes(trimmed)) {
                patterns.push(trimmed);
            }
        }
    }
    return patterns;
}
//# sourceMappingURL=safe-outputs.js.map