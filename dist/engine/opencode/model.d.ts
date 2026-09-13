/** Default quando `AGENTIC_CODE_REVIEWERS_ENGINE=opencode` e modelo omitido. */
export declare const DEFAULT_OPENCODE_MODEL = "anthropic/claude-sonnet-4-6";
export interface OpencodeModelSelection {
    providerID: string;
    modelID: string;
    /** Formato `provider/model` passado ao servidor. */
    composite: string;
}
/** Valida e decompõe `provider/model` exigido pelo OpenCode. */
export declare function resolveOpencodeModelSelection(model: string): OpencodeModelSelection;
export declare function assertOpencodeModel(model: string): string;
/**
 * Model capability behind the shared engine contract: `provider/model`
 * shape validation. Async for parity with `cursor-sdk` (which hits the
 * live catalog); never touches the Cursor catalog.
 */
export declare function validateOpencodeModel(model: string): Promise<string>;
//# sourceMappingURL=model.d.ts.map