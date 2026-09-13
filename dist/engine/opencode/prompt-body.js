/** Monta o body de session.prompt; model opcional para fallback ao default do servidor. */
export function buildSessionPromptBody(agentName, prompt, modelSelection, variant) {
    const body = {
        agent: agentName,
        parts: [{ type: 'text', text: prompt }],
    };
    const normalizedVariant = variant?.trim() || undefined;
    if (modelSelection) {
        body.model = {
            providerID: modelSelection.providerID,
            modelID: modelSelection.modelID,
            ...(normalizedVariant ? { variant: normalizedVariant } : {}),
        };
    }
    if (normalizedVariant) {
        body.variant = normalizedVariant;
    }
    return body;
}
/** Indica se um erro de session.prompt justifica retry sem model explícito. */
export function shouldFallbackSessionPromptWithoutModel(error) {
    return error !== undefined && error !== null;
}
//# sourceMappingURL=prompt-body.js.map