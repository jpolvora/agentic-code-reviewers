import type { ReviewerConfig } from '../config.js';
import type { CodeReviewItem } from './types.js';
import { type ChangedLinesMap } from '../git/diff-lines.js';
export declare const DEFAULT_PROTECTED_PATTERNS: readonly [".github/workflows/**", ".github/actions/**", "azure-pipelines*.yml", "**/azure-pipelines/**", "package.json", "**/package-lock.json", "yarn.lock", "pnpm-lock.yaml", "go.mod", "go.sum", "Cargo.toml", "composer.json", "composer.lock", "Dockerfile*", "docker-compose*", ".env*"];
export declare const DEFAULT_MAX_COMMENT_CHARS = 8000;
export interface SafeOutputOptions {
    enabled: boolean;
    requireDiffLine: boolean;
    maxCommentChars: number;
    protectedPatterns: string[];
    changedLines: ChangedLinesMap;
    /** Limiar mínimo (inclusive) alinhado a config.scoreMin / AGENTIC_CODE_REVIEWERS_SCORE_MIN. */
    scoreMin: number;
}
export type SafeOutputRejectReason = 'diff-line' | 'protected-path' | 'severity-score' | 'analysis-structure' | 'size-limit' | 'secret-pattern' | 'dangerous-markdown';
export interface SafeOutputCheckResult {
    safe: boolean;
    reason?: SafeOutputRejectReason;
    detail?: string;
}
/** Deterministic safe-output check for a single review item. */
export declare function checkSafeReview(review: CodeReviewItem, options: SafeOutputOptions): SafeOutputCheckResult;
export declare function isSafeReview(review: CodeReviewItem, options: SafeOutputOptions): boolean;
export declare function filterSafeOutputs(reviews: CodeReviewItem[], options: SafeOutputOptions): CodeReviewItem[];
export declare function buildSafeOutputOptions(config: ReviewerConfig, diffText: string): SafeOutputOptions;
export declare function buildDefaultProtectedPatterns(extraCsv?: string): string[];
//# sourceMappingURL=safe-outputs.d.ts.map