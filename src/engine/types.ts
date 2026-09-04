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

export interface EngineModelValidationOptions {
  apiKey?: string;
}

/** Rejected by the live catalog (or engine shape check): known engine, unknown model. */
export class UnsupportedModelError extends Error {
  readonly engine: string;
  readonly requested: string;
  readonly available: string[];
  constructor(engine: string, requested: string, available: string[] = []) {
    super(
      `Modelo inválido: "${requested}" (engine ${engine}).` +
        (available.length > 0 ? ` Modelos disponíveis: ${available.join(', ')}` : ''),
    );
    this.name = 'UnsupportedModelError';
    this.engine = engine;
    this.requested = requested;
    this.available = available;
  }
}

/** Catalog (auth/network/API) could not be loaded: actionable, no silent fallback. */
export class ModelCatalogError extends Error {
  readonly engine: string;
  constructor(engine: string, message: string) {
    super(`Falha ao carregar catálogo de modelos (${engine}): ${message}`);
    this.name = 'ModelCatalogError';
    this.engine = engine;
  }
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
