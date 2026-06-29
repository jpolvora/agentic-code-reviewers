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
export interface ExecutionEngine {
    readonly engineName: ReviewerEngineName;
    run(config: ReviewerConfig, options: EngineRunOptions, logger: Logger): Promise<EngineRunResult>;
}
//# sourceMappingURL=types.d.ts.map