import type { ReviewerConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import {
  ENGINE_METRIC_KEYS,
  type EngineRunOptions,
  type EngineRunResult,
  type ExecutionEngine,
} from '../types.js';
import { runAgentStream } from './stream.js';
import type { TokenUsageTotals } from './token-usage.js';

function tokenUsageToMetrics(usage: TokenUsageTotals): Record<string, number> {
  if (!usage.hasAuthoritativeUsage && usage.totalTokens === 0) {
    return {};
  }

  const metrics: Record<string, number> = {
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

export class CursorSdkEngine implements ExecutionEngine {
  readonly engineName = 'cursor-sdk' as const;

  async run(config: ReviewerConfig, options: EngineRunOptions, logger: Logger): Promise<EngineRunResult> {
    const result = await runAgentStream(
      config,
      {
        name: options.name,
        prompt: options.prompt,
        resumeAgentId: options.resumeSessionId,
      },
      logger,
    );

    return {
      sessionId: result.agentId,
      runId: result.runId,
      status: result.status,
      fullText: result.fullText,
      metrics: tokenUsageToMetrics(result.tokenUsage),
    };
  }
}
