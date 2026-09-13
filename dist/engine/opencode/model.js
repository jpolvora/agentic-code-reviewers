/** Default quando `AGENTIC_CODE_REVIEWERS_ENGINE=opencode` e modelo omitido. */
export const DEFAULT_OPENCODE_MODEL = 'anthropic/claude-sonnet-4-6';
/** Valida e decompõe `provider/model` exigido pelo OpenCode. */
export function resolveOpencodeModelSelection(model) {
    const trimmed = model.trim();
    const slash = trimmed.indexOf('/');
    if (slash <= 0 || slash === trimmed.length - 1) {
        throw new Error(`Modelo opencode inválido: "${trimmed}". Use o formato provider/model (ex.: ${DEFAULT_OPENCODE_MODEL}).`);
    }
    const providerID = trimmed.slice(0, slash);
    const modelID = trimmed.slice(slash + 1);
    return { providerID, modelID, composite: trimmed };
}
export function assertOpencodeModel(model) {
    resolveOpencodeModelSelection(model);
    return model.trim();
}
/**
 * Model capability behind the shared engine contract: `provider/model`
 * shape validation. Async for parity with `cursor-sdk` (which hits the
 * live catalog); never touches the Cursor catalog.
 */
export async function validateOpencodeModel(model) {
    return assertOpencodeModel(model);
}
//# sourceMappingURL=model.js.map