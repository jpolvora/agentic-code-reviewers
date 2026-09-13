import { CursorSdkEngine } from './cursor-sdk/engine.js';
import { OpencodeEngine } from './opencode/engine.js';
export { EMPTY_METRICS, ENGINE_METRIC_KEYS, ModelCatalogError, UnsupportedModelError } from './types.js';
/** Registered engine implementations: the single source of truth for engine names. */
const ENGINE_REGISTRY = {
    'cursor-sdk': () => new CursorSdkEngine(),
    opencode: () => new OpencodeEngine(),
};
/** Accepted `--engine` / env inputs (canonical names + aliases). Derived from the registry. */
const ENGINE_ALIASES = {
    cursor: 'cursor-sdk',
    'cursor-sdk': 'cursor-sdk',
    opencode: 'opencode',
};
export function listSupportedEngines() {
    return Object.keys(ENGINE_REGISTRY);
}
export function listSupportedEngineInputs() {
    return Object.keys(ENGINE_ALIASES);
}
/**
 * Capability-based engine parsing: accepted values derive from the
 * registered implementations (+ aliases), never from a static model list.
 */
export function parseEngineName(value) {
    const trimmed = value?.trim().toLowerCase() ?? '';
    if (!trimmed)
        return 'cursor-sdk';
    const resolved = ENGINE_ALIASES[trimmed];
    if (resolved)
        return resolved;
    throw new Error(`Engine inválido: "${value}". Valores aceitos: ${listSupportedEngineInputs().join(', ')}`);
}
export function createEngine(name) {
    return ENGINE_REGISTRY[name]();
}
export function getEngine(config) {
    return createEngine(config.engine);
}
//# sourceMappingURL=index.js.map