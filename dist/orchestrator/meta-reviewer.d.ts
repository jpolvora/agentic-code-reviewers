import type { ReviewerConfig } from '../config.js';
import type { ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
import type { CodeReviewItem } from '../ado/types.js';
export declare function runMetaReviewer(config: ReviewerConfig, engine: ExecutionEngine, logger: Logger, candidates: CodeReviewItem[], diffExcerpt: string): Promise<CodeReviewItem[]>;
//# sourceMappingURL=meta-reviewer.d.ts.map