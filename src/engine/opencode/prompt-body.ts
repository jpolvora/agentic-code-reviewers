import type { OpencodeModelSelection } from './model.js';

export type SessionPromptBody = {
  agent: string;
  parts: Array<{ type: 'text'; text: string }>;
  model?: {
    providerID: string;
    modelID: string;
  };
};

/** Monta o body de session.prompt; model opcional para fallback ao default do servidor. */
export function buildSessionPromptBody(
  agentName: string,
  prompt: string,
  modelSelection?: OpencodeModelSelection,
): SessionPromptBody {
  const body: SessionPromptBody = {
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
export function shouldFallbackSessionPromptWithoutModel(error: unknown): boolean {
  return error !== undefined && error !== null;
}
