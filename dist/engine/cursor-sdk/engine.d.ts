import type { ReviewerConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import { type EngineRunOptions, type EngineRunResult, type ExecutionEngine } from '../types.js';
export declare class CursorSdkEngine implements ExecutionEngine {
    readonly engineName: "cursor-sdk";
    run(config: ReviewerConfig, options: EngineRunOptions, logger: Logger): Promise<EngineRunResult>;
}
//# sourceMappingURL=engine.d.ts.map