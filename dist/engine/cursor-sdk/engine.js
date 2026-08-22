import { ENGINE_METRIC_KEYS, } from '../types.js';
import { runAgentStream } from './stream.js';
function tokenUsageToMetrics(usage) {
    if (!usage.hasAuthoritativeUsage && usage.totalTokens === 0) {
        return {};
    }
    const metrics = {
        [ENGINE_METRIC_KEYS.inputTokens]: usage.inputTokens,
        [ENGINE_METRIC_KEYS.outputTokens]: usage.outputTokens,
        [ENGINE_METRIC_KEYS.totalTokens]: usage.totalTokens,
    };
    if (usage.cacheReadTokens > 0) {
        metrics[ENGINE_METRIC_KEYS.cacheReadTokens] = usage.cacheReadTokens;
    }
    if (usage.cacheWriteTokens > 0) {
        metrics[ENGINE_METRIC_KEYS.cacheWriteTokens] = usage.cacheWriteTokens;
    }
    if (usage.turnCount > 0) {
        metrics[ENGINE_METRIC_KEYS.turnCount] = usage.turnCount;
    }
    return metrics;
}
export class CursorSdkEngine {
    engineName = 'cursor-sdk';
    async run(config, options, logger) {
        const result = await runAgentStream(config, {
            name: options.name,
            prompt: options.prompt,
            resumeAgentId: options.resumeSessionId,
        }, logger);
        return {
            sessionId: result.agentId,
            runId: result.runId,
            status: result.status,
            fullText: result.fullText,
            metrics: tokenUsageToMetrics(result.tokenUsage),
        };
    }
}
//# sourceMappingURL=engine.js.map