import type { ReviewerConfig } from '../config.js';
import { CursorSdkEngine } from './cursor-sdk/engine.js';
import { OpencodeEngine } from './opencode/engine.js';
import type { ExecutionEngine } from './types.js';

export type {
  EngineModelValidationOptions,
  EngineRunOptions,
  EngineRunResult,
  ExecutionEngine,
  ReviewerEngineName,
} from './types.js';
export { EMPTY_METRICS, ENGINE_METRIC_KEYS, ModelCatalogError, UnsupportedModelError } from './types.js';
import type { ReviewerEngineName } from './types.js';

type EngineFactory = () => ExecutionEngine;

/** Registered engine implementations: the single source of truth for engine names. */
const ENGINE_REGISTRY: Record<ReviewerEngineName, EngineFactory> = {
  'cursor-sdk': () => new CursorSdkEngine(),
  opencode: () => new OpencodeEngine(),
};

/** Accepted `--engine` / env inputs (canonical names + aliases). Derived from the registry. */
const ENGINE_ALIASES: Record<string, ReviewerEngineName> = {
  cursor: 'cursor-sdk',
  'cursor-sdk': 'cursor-sdk',
  opencode: 'opencode',
};

export function listSupportedEngines(): ReviewerEngineName[] {
  return Object.keys(ENGINE_REGISTRY) as ReviewerEngineName[];
}

export function listSupportedEngineInputs(): string[] {
  return Object.keys(ENGINE_ALIASES);
}

/**
 * Capability-based engine parsing: accepted values derive from the
 * registered implementations (+ aliases), never from a static model list.
 */
export function parseEngineName(value: string | undefined): ReviewerEngineName {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (!trimmed) return 'cursor-sdk';
  const resolved = ENGINE_ALIASES[trimmed];
  if (resolved) return resolved;
  throw new Error(`Engine inválido: "${value}". Valores aceitos: ${listSupportedEngineInputs().join(', ')}`);
}

export function createEngine(name: ReviewerEngineName): ExecutionEngine {
  return ENGINE_REGISTRY[name]();
}

export function getEngine(config: ReviewerConfig): ExecutionEngine {
  return createEngine(config.engine);
}
