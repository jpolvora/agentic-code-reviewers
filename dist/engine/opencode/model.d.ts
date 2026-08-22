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
//# sourceMappingURL=model.d.ts.map