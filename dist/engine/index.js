import { CursorSdkEngine } from './cursor-sdk/engine.js';
import { OpencodeEngine } from './opencode/engine.js';
export { EMPTY_METRICS, ENGINE_METRIC_KEYS } from './types.js';
export function getEngine(config) {
    switch (config.engine) {
        case 'opencode':
            return new OpencodeEngine();
        case 'cursor-sdk':
        default:
            return new CursorSdkEngine();
    }
}
//# sourceMappingURL=index.js.map