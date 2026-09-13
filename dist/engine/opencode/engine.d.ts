import type { ReviewerConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import { type EngineRunOptions, type EngineRunResult, type ExecutionEngine } from '../types.js';
export declare class OpencodeEngine implements ExecutionEngine {
    readonly engineName: "opencode";
    validateModel(model: string): Promise<string>;
    run(config: ReviewerConfig, options: EngineRunOptions, logger: Logger): Promise<EngineRunResult>;
}
//# sourceMappingURL=engine.d.ts.map