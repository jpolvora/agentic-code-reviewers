import type { ReviewerConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import { type EngineModelValidationOptions, type EngineRunOptions, type EngineRunResult, type ExecutionEngine } from '../types.js';
import { type CursorModelLister } from './model.js';
export declare class CursorSdkEngine implements ExecutionEngine {
    private readonly modelLister?;
    readonly engineName: "cursor-sdk";
    constructor(modelLister?: CursorModelLister | undefined);
    validateModel(model: string, options?: EngineModelValidationOptions): Promise<string>;
    run(config: ReviewerConfig, options: EngineRunOptions, logger: Logger): Promise<EngineRunResult>;
}
//# sourceMappingURL=engine.d.ts.map