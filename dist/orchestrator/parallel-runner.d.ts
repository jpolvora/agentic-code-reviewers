import type { ReviewerConfig } from '../config.js';
import type { DiffOptions } from '../git/diff.js';
import type { ExecutionEngine, EngineRunResult } from '../engine/types.js';
import type { Logger } from '../logger.js';
import type { PromptContext } from '../agent/prompt.js';
export interface ParallelReviewOptions {
    parallelChunks: number;
    metaReviewer: boolean;
    filteredFiles: string[];
    diffRange: string;
    diffOptions: DiffOptions;
}
export declare function runParallelReview(config: ReviewerConfig, baseContext: PromptContext, engine: ExecutionEngine, logger: Logger, options: ParallelReviewOptions): Promise<EngineRunResult>;
//# sourceMappingURL=parallel-runner.d.ts.map