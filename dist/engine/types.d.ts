import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';
export type ReviewerEngineName = 'cursor-sdk' | 'opencode';
/** Chaves padronizadas em EngineRunResult.metrics. */
export declare const ENGINE_METRIC_KEYS: {
    readonly inputTokens: "input_tokens";
    readonly outputTokens: "output_tokens";
    readonly cacheReadTokens: "cache_read_tokens";
    readonly cacheWriteTokens: "cache_write_tokens";
    readonly totalTokens: "total_tokens";
    readonly turnCount: "turn_count";
};
export declare const EMPTY_METRICS: Record<string, number>;
export interface EngineModelValidationOptions {
    apiKey?: string;
}
/** Rejected by the live catalog (or engine shape check): known engine, unknown model. */
export declare class UnsupportedModelError extends Error {
    readonly engine: string;
    readonly requested: string;
    readonly available: string[];
    constructor(engine: string, requested: string, available?: string[]);
}
/** Catalog (auth/network/API) could not be loaded: actionable, no silent fallback. */
export declare class ModelCatalogError extends Error {
    readonly engine: string;
    constructor(engine: string, message: string);
}
/**
 * Model capability every engine implements behind the shared contract.
 * Callers validate/resolve through this abstraction, never by branching
 * on engine names at call sites. Returns the exact id to pass to the SDK.
 */
export interface EngineModelCapability {
    validateModel(model: string, options?: EngineModelValidationOptions): Promise<string>;
}
export interface EngineRunOptions {
    name: string;
    prompt: string;
    /** cursor-sdk: agentId; opencode: session id */
    resumeSessionId?: string;
}
export interface EngineRunResult {
    /** cursor-sdk: agentId; opencode: session.id */
    sessionId: string;
    /** cursor-sdk: run.id; opencode: message.id */
    runId: string;
    status: string;
    fullText: string;
    metrics: Record<string, number>;
}
export interface ExecutionEngine extends EngineModelCapability {
    readonly engineName: ReviewerEngineName;
    run(config: ReviewerConfig, options: EngineRunOptions, logger: Logger): Promise<EngineRunResult>;
}
//# sourceMappingURL=types.d.ts.map