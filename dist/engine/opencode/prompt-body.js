/** Monta o body de session.prompt; model opcional para fallback ao default do servidor. */
export function buildSessionPromptBody(agentName, prompt, modelSelection) {
    const body = {
        agent: agentName,
        parts: [{ type: 'text', text: prompt }],
    };
    if (modelSelection) {
        body.model = {
            providerID: modelSelection.providerID,
            modelID: modelSelection.modelID,
        };
    }
    return body;
}
/** Indica se um erro de session.prompt justifica retry sem model explícito. */
export function shouldFallbackSessionPromptWithoutModel(error) {
    return error !== undefined && error !== null;
}
//# sourceMappingURL=prompt-body.js.map