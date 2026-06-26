import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';

export type ReviewerEngineName = 'cursor-sdk' | 'opencode';

/** Chaves padronizadas em EngineRunResult.metrics. */
export const ENGINE_METRIC_KEYS = {
  inputTokens: 'input_tokens',
  outputTokens: 'output_tokens',
  cacheReadTokens: 'cache_read_tokens',
  cacheWriteTokens: 'cache_write_tokens',
  totalTokens: 'total_tokens',
  turnCount: 'turn_count',
} as const;

export const EMPTY_METRICS: Record<string, number> = {};

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
