/** Default quando CLI/env omitidos ou macro ADO não expandida. */
export declare const DEFAULT_CURSOR_REVIEWER_MODEL = "composer-2.5";
/** ID canônico do Composer 2.5 no Cursor SDK. */
export declare const CANONICAL_COMPOSER_25_MODEL_ID = "composer-2.5";
export interface CursorModelCatalogItem {
    id: string;
    aliases?: string[];
}
export type CursorModelLister = (options?: {
    apiKey?: string;
}) => Promise<CursorModelCatalogItem[]>;
/**
 * Shape-only check (sync, sem catálogo): id não vazio ou default.
 * A validação contra o catálogo (`Cursor.models.list()`) acontece em
 * `validateCursorModelId`, no tempo de execução do engine.
 */
export declare function resolveCursorModelShape(modelId: string): string;
/**
 * Valida o id contra o catálogo live (`Cursor.models.list()`) da conta
 * autenticada. Retorna o identificador canônico do catálogo byte-for-byte.
 * Erros distinguem modelo não suportado (`UnsupportedModelError`, com ids
 * descobertos quando disponíveis) de falha de catálogo (`ModelCatalogError`,
 * sem fallback silencioso).
 */
export declare function validateCursorModelId(modelId: string, lister?: CursorModelLister, options?: {
    apiKey?: string;
}): Promise<string>;
export interface AgentModelSelection {
    id: string;
    params?: Array<{
        id: string;
        value: string;
    }>;
}
/** Converte o id (já validado no runtime) em seleção passada ao SDK. */
export declare function resolveAgentModelSelection(modelId: string): AgentModelSelection;
//# sourceMappingURL=model.d.ts.map