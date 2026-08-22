import type { ReviewerConfig } from '../config.js';
import type { ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
import type { PromptContext } from './prompt.js';
export interface ArtifactOptions {
    commitMessage: boolean;
    prDescription: boolean;
}
export declare function runReviewArtifacts(config: ReviewerConfig, context: PromptContext, engine: ExecutionEngine, logger: Logger, options: ArtifactOptions): Promise<void>;
//# sourceMappingURL=artifact-runner.d.ts.map