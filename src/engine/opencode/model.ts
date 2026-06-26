/** Default quando `CURSOR_REVIEWER_ENGINE=opencode` e modelo omitido. */
export const DEFAULT_OPENCODE_MODEL = 'anthropic/claude-sonnet-4-6';

export interface OpencodeModelSelection {
  providerID: string;
  modelID: string;
  /** Formato `provider/model` passado ao servidor. */
  composite: string;
}

/** Valida e decompõe `provider/model` exigido pelo OpenCode. */
export function resolveOpencodeModelSelection(model: string): OpencodeModelSelection {
  const trimmed = model.trim();
  const slash = trimmed.indexOf('/');
  if (slash <= 0 || slash === trimmed.length - 1) {
    throw new Error(
      `Modelo opencode inválido: "${trimmed}". Use o formato provider/model (ex.: ${DEFAULT_OPENCODE_MODEL}).`,
    );
  }

  const providerID = trimmed.slice(0, slash);
  const modelID = trimmed.slice(slash + 1);
  return { providerID, modelID, composite: trimmed };
}

export function assertOpencodeModel(model: string): string {
  resolveOpencodeModelSelection(model);
  return model.trim();
}
