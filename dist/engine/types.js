/** Chaves padronizadas em EngineRunResult.metrics. */
export const ENGINE_METRIC_KEYS = {
    inputTokens: 'input_tokens',
    outputTokens: 'output_tokens',
    cacheReadTokens: 'cache_read_tokens',
    cacheWriteTokens: 'cache_write_tokens',
    totalTokens: 'total_tokens',
    turnCount: 'turn_count',
};
export const EMPTY_METRICS = {};
/** Rejected by the live catalog (or engine shape check): known engine, unknown model. */
export class UnsupportedModelError extends Error {
    engine;
    requested;
    available;
    constructor(engine, requested, available = []) {
        super(`Modelo inválido: "${requested}" (engine ${engine}).` +
            (available.length > 0 ? ` Modelos disponíveis: ${available.join(', ')}` : ''));
        this.name = 'UnsupportedModelError';
        this.engine = engine;
        this.requested = requested;
        this.available = available;
    }
}
/** Catalog (auth/network/API) could not be loaded: actionable, no silent fallback. */
export class ModelCatalogError extends Error {
    engine;
    constructor(engine, message) {
        super(`Falha ao carregar catálogo de modelos (${engine}): ${message}`);
        this.name = 'ModelCatalogError';
        this.engine = engine;
    }
}
//# sourceMappingURL=types.js.map