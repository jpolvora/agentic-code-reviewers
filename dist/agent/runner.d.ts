import type { ReviewerConfig } from '../config.js';
import type { EngineRunResult, ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
import { type PromptContext } from './prompt.js';
export type { EngineRunResult };
export declare function runCodeReviewAgent(config: ReviewerConfig, context: PromptContext, engine: ExecutionEngine, logger: Logger): Promise<EngineRunResult>;
//# sourceMappingURL=runner.d.ts.map