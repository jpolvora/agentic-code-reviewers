/** IDs aceitos pelo Cursor SDK (`Cursor.models.list()` → `id`). */
export var CursorReviewerModelId;
(function (CursorReviewerModelId) {
    CursorReviewerModelId["Default"] = "default";
    CursorReviewerModelId["Composer25"] = "composer-2.5";
    CursorReviewerModelId["ClaudeOpus48"] = "claude-opus-4-8";
    CursorReviewerModelId["Gpt55"] = "gpt-5.5";
    CursorReviewerModelId["ClaudeSonnet46"] = "claude-sonnet-4-6";
    CursorReviewerModelId["Composer2"] = "composer-2";
    CursorReviewerModelId["Gpt53Codex"] = "gpt-5.3-codex";
    CursorReviewerModelId["ClaudeOpus47"] = "claude-opus-4-7";
    CursorReviewerModelId["GrokBuild01"] = "grok-build-0.1";
    CursorReviewerModelId["Gpt54"] = "gpt-5.4";
    CursorReviewerModelId["ClaudeOpus46"] = "claude-opus-4-6";
    CursorReviewerModelId["ClaudeOpus45"] = "claude-opus-4-5";
    CursorReviewerModelId["Gpt52"] = "gpt-5.2";
    CursorReviewerModelId["Gemini31Pro"] = "gemini-3.1-pro";
    CursorReviewerModelId["Gpt54Mini"] = "gpt-5.4-mini";
    CursorReviewerModelId["Gpt54Nano"] = "gpt-5.4-nano";
    CursorReviewerModelId["ClaudeHaiku45"] = "claude-haiku-4-5";
    CursorReviewerModelId["Grok43"] = "grok-4.3";
    CursorReviewerModelId["ClaudeSonnet45"] = "claude-sonnet-4-5";
    CursorReviewerModelId["Gpt52Codex"] = "gpt-5.2-codex";
    CursorReviewerModelId["Gpt51CodexMax"] = "gpt-5.1-codex-max";
    CursorReviewerModelId["Gpt51"] = "gpt-5.1";
    CursorReviewerModelId["Gemini3Flash"] = "gemini-3-flash";
    CursorReviewerModelId["Gemini35Flash"] = "gemini-3.5-flash";
    CursorReviewerModelId["Gpt51CodexMini"] = "gpt-5.1-codex-mini";
    CursorReviewerModelId["ClaudeSonnet4"] = "claude-sonnet-4";
    CursorReviewerModelId["Gpt5Mini"] = "gpt-5-mini";
    CursorReviewerModelId["Gemini25Flash"] = "gemini-2.5-flash";
    CursorReviewerModelId["KimiK25"] = "kimi-k2.5";
    CursorReviewerModelId["ClaudeFable5"] = "claude-fable-5";
})(CursorReviewerModelId || (CursorReviewerModelId = {}));
/** ID canônico do Composer 2.5 no Cursor SDK. */
export const CANONICAL_COMPOSER_25_MODEL_ID = CursorReviewerModelId.Composer25;
/** Default quando CLI/env omitidos ou macro ADO não expandida. */
export const DEFAULT_CURSOR_REVIEWER_MODEL = CANONICAL_COMPOSER_25_MODEL_ID;
const SUPPORTED_MODEL_IDS = new Set(Object.values(CursorReviewerModelId));
export function isSupportedCursorReviewerModelId(value) {
    return SUPPORTED_MODEL_IDS.has(value);
}
export function listSupportedCursorReviewerModelIds() {
    return [...SUPPORTED_MODEL_IDS].sort((a, b) => a.localeCompare(b));
}
/** Valida o id configurado; lança se inválido. */
export function assertSupportedCursorReviewerModelId(modelId) {
    const trimmed = modelId.trim();
    if (!isSupportedCursorReviewerModelId(trimmed)) {
        throw new Error(`Modelo inválido: "${trimmed}". Valores aceitos: ${listSupportedCursorReviewerModelIds().join(', ')}`);
    }
    return trimmed;
}
/** Converte o id já validado em seleção passada ao SDK. */
export function resolveAgentModelSelection(modelId) {
    const id = assertSupportedCursorReviewerModelId(modelId.trim() || DEFAULT_CURSOR_REVIEWER_MODEL);
    return { id };
}
//# sourceMappingURL=model.js.map