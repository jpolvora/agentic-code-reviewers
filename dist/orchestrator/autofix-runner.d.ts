import type { ReviewerConfig } from '../config.js';
import type { ActiveThreadInfo, ReviewContextResult } from '../ado/types.js';
import type { PlatformProvider } from '../provider/types.js';
import type { ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
export interface Replacement {
    startLine: number;
    endLine: number;
    replacementContent: string;
}
export declare function validateReplacements(replacements: Replacement[]): void;
export declare function assertNonOverlapping(replacements: Replacement[]): void;
export declare function applyReplacements(content: string, replacements: Replacement[]): string;
export declare function computeUpdatedLineNumber(originalLine: number, replacements: Replacement[]): number;
export declare function isThreadLineModified(fileContent: string, updatedContent: string, threadLineNumber: number, replacements: Replacement[]): boolean;
export declare function parseAutoFixCommitThreadIds(subject: string): string[] | null;
export declare function buildRecoverySummary(modifiedFiles: string[], threadIds: string[]): string;
export declare function getAutoFixThreads(reviewContext: ReviewContextResult): ActiveThreadInfo[];
export declare function testAutoFixSummaryAlreadyPosted(reviewContext: ReviewContextResult, _botTag: string, summaryText: string): boolean;
export declare function runAutoFixFlow(config: ReviewerConfig, reviewContext: ReviewContextResult, provider: PlatformProvider, engine: ExecutionEngine, logger: Logger): Promise<void>;
//# sourceMappingURL=autofix-runner.d.ts.map