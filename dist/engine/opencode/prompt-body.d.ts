import type { OpencodeModelSelection } from './model.js';
export type SessionPromptBody = {
    agent: string;
    parts: Array<{
        type: 'text';
        text: string;
    }>;
    model?: {
        providerID: string;
        modelID: string;
    };
};
/** Monta o body de session.prompt; model opcional para fallback ao default do servidor. */
export declare function buildSessionPromptBody(agentName: string, prompt: string, modelSelection?: OpencodeModelSelection): SessionPromptBody;
/** Indica se um erro de session.prompt justifica retry sem model explícito. */
export declare function shouldFallbackSessionPromptWithoutModel(error: unknown): boolean;
//# sourceMappingURL=prompt-body.d.ts.map