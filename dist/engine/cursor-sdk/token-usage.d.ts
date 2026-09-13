import type { InteractionUpdate } from '@cursor/sdk';
/** Totais de tokens acumulados durante a execução do agente. */
export interface TokenUsageTotals {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    /** input + output (cache não entra no total principal). */
    totalTokens: number;
    /** Quantidade de eventos `turn-ended` com `usage` recebidos. */
    turnCount: number;
    /** True quando pelo menos um `turn-ended.usage` foi recebido do SDK. */
    hasAuthoritativeUsage: boolean;
}
export declare const EMPTY_TOKEN_USAGE: TokenUsageTotals;
/**
 * Acumula tokens a partir dos deltas do SDK (`onDelta` em `agent.send()`).
 * Fonte primária: `turn-ended.usage` (input/output/cache por turno do modelo).
 * Fallback: soma de `token-delta` quando `usage` não é emitido.
 */
export declare class TokenUsageAccumulator {
    private inputTokens;
    private outputTokens;
    private cacheReadTokens;
    private cacheWriteTokens;
    private turnCount;
    private hasAuthoritativeUsage;
    private outputTokensFallback;
    reset(): void;
    applyInteractionUpdate(update: InteractionUpdate): void;
    getTotals(): TokenUsageTotals;
}
export declare function formatTokenCount(value: number): string;
/** Linhas de log para o resumo final de tokens. */
export declare function formatTokenUsageSummary(usage: TokenUsageTotals): string[];
//# sourceMappingURL=token-usage.d.ts.map