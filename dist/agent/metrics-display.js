import { ENGINE_METRIC_KEYS } from '../engine/types.js';
export function formatTokenCount(value) {
    return value.toLocaleString('pt-BR');
}
export function hasEngineMetrics(metrics) {
    if (!metrics)
        return false;
    const total = metrics[ENGINE_METRIC_KEYS.totalTokens] ?? 0;
    const input = metrics[ENGINE_METRIC_KEYS.inputTokens] ?? 0;
    const output = metrics[ENGINE_METRIC_KEYS.outputTokens] ?? 0;
    return total > 0 || input > 0 || output > 0;
}
/** Linhas de log para o resumo final de métricas do engine. */
export function formatEngineMetrics(metrics) {
    if (!hasEngineMetrics(metrics)) {
        return ['Tokens: (não reportados pelo engine nesta execução)'];
    }
    const input = metrics[ENGINE_METRIC_KEYS.inputTokens] ?? 0;
    const output = metrics[ENGINE_METRIC_KEYS.outputTokens] ?? 0;
    const total = metrics[ENGINE_METRIC_KEYS.totalTokens] ?? input + output;
    const cacheRead = metrics[ENGINE_METRIC_KEYS.cacheReadTokens] ?? 0;
    const cacheWrite = metrics[ENGINE_METRIC_KEYS.cacheWriteTokens] ?? 0;
    const turnCount = metrics[ENGINE_METRIC_KEYS.turnCount] ?? 0;
    const lines = [
        `Tokens input:  ${formatTokenCount(input)}`,
        `Tokens output: ${formatTokenCount(output)}`,
        `Tokens total:  ${formatTokenCount(total)}`,
    ];
    if (cacheRead > 0 || cacheWrite > 0) {
        lines.push(`Cache read:    ${formatTokenCount(cacheRead)}`, `Cache write:   ${formatTokenCount(cacheWrite)}`);
    }
    if (turnCount > 1) {
        lines.push(`Turnos modelo: ${turnCount}`);
    }
    return lines;
}
/** Linhas compactas para markdown de pipeline (ADO/GitHub). */
export function formatEngineMetricsMarkdownLines(metrics) {
    if (!hasEngineMetrics(metrics)) {
        return [];
    }
    const input = metrics[ENGINE_METRIC_KEYS.inputTokens] ?? 0;
    const output = metrics[ENGINE_METRIC_KEYS.outputTokens] ?? 0;
    const total = metrics[ENGINE_METRIC_KEYS.totalTokens] ?? input + output;
    const cacheRead = metrics[ENGINE_METRIC_KEYS.cacheReadTokens] ?? 0;
    const cacheWrite = metrics[ENGINE_METRIC_KEYS.cacheWriteTokens] ?? 0;
    const lines = [
        `- **Tokens input:** ${formatTokenCount(input)}`,
        `- **Tokens output:** ${formatTokenCount(output)}`,
        `- **Tokens total:** ${formatTokenCount(total)}`,
    ];
    if (cacheRead > 0 || cacheWrite > 0) {
        lines.push(`- **Cache read:** ${formatTokenCount(cacheRead)}`, `- **Cache write:** ${formatTokenCount(cacheWrite)}`);
    }
    return lines;
}
//# sourceMappingURL=metrics-display.js.map