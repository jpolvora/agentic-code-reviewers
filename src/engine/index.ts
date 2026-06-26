import type { ReviewerConfig } from '../config.js';
import { CursorSdkEngine } from './cursor-sdk/engine.js';
import { OpencodeEngine } from './opencode/engine.js';
import type { ExecutionEngine } from './types.js';

export type {
  EngineRunOptions,
  EngineRunResult,
  ExecutionEngine,
  ReviewerEngineName,
} from './types.js';
export { EMPTY_METRICS, ENGINE_METRIC_KEYS } from './types.js';

export function getEngine(config: ReviewerConfig): ExecutionEngine {
  switch (config.engine) {
    case 'opencode':
      return new OpencodeEngine();
    case 'cursor-sdk':
    default:
      return new CursorSdkEngine();
  }
}
