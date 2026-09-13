import type { ReviewerConfig } from '../config.js';
import type { ExecutionEngine } from './types.js';
export type { EngineModelValidationOptions, EngineRunOptions, EngineRunResult, ExecutionEngine, ReviewerEngineName, } from './types.js';
export { EMPTY_METRICS, ENGINE_METRIC_KEYS, ModelCatalogError, UnsupportedModelError } from './types.js';
import type { ReviewerEngineName } from './types.js';
export declare function listSupportedEngines(): ReviewerEngineName[];
export declare function listSupportedEngineInputs(): string[];
/**
 * Capability-based engine parsing: accepted values derive from the
 * registered implementations (+ aliases), never from a static model list.
 */
export declare function parseEngineName(value: string | undefined): ReviewerEngineName;
export declare function createEngine(name: ReviewerEngineName): ExecutionEngine;
export declare function getEngine(config: ReviewerConfig): ExecutionEngine;
//# sourceMappingURL=index.d.ts.map