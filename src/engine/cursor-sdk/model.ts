/** IDs aceitos pelo Cursor SDK (`Cursor.models.list()` → `id`). */
export enum CursorReviewerModelId {
  Default = 'default',
  Composer25 = 'composer-2.5',
  ClaudeOpus48 = 'claude-opus-4-8',
  Gpt55 = 'gpt-5.5',
  ClaudeSonnet46 = 'claude-sonnet-4-6',
  Composer2 = 'composer-2',
  Gpt53Codex = 'gpt-5.3-codex',
  ClaudeOpus47 = 'claude-opus-4-7',
  GrokBuild01 = 'grok-build-0.1',
  Gpt54 = 'gpt-5.4',
  ClaudeOpus46 = 'claude-opus-4-6',
  ClaudeOpus45 = 'claude-opus-4-5',
  Gpt52 = 'gpt-5.2',
  Gemini31Pro = 'gemini-3.1-pro',
  Gpt54Mini = 'gpt-5.4-mini',
  Gpt54Nano = 'gpt-5.4-nano',
  ClaudeHaiku45 = 'claude-haiku-4-5',
  Grok43 = 'grok-4.3',
  ClaudeSonnet45 = 'claude-sonnet-4-5',
  Gpt52Codex = 'gpt-5.2-codex',
  Gpt51CodexMax = 'gpt-5.1-codex-max',
  Gpt51 = 'gpt-5.1',
  Gemini3Flash = 'gemini-3-flash',
  Gemini35Flash = 'gemini-3.5-flash',
  Gpt51CodexMini = 'gpt-5.1-codex-mini',
  ClaudeSonnet4 = 'claude-sonnet-4',
  Gpt5Mini = 'gpt-5-mini',
  Gemini25Flash = 'gemini-2.5-flash',
  KimiK25 = 'kimi-k2.5',
  ClaudeFable5 = 'claude-fable-5',
}

/** ID canônico do Composer 2.5 no Cursor SDK. */
export const CANONICAL_COMPOSER_25_MODEL_ID = CursorReviewerModelId.Composer25;

/** Default quando CLI/env omitidos ou macro ADO não expandida. */
export const DEFAULT_CURSOR_REVIEWER_MODEL = CANONICAL_COMPOSER_25_MODEL_ID;

const SUPPORTED_MODEL_IDS = new Set<string>(Object.values(CursorReviewerModelId));

export function isSupportedCursorReviewerModelId(value: string): value is CursorReviewerModelId {
  return SUPPORTED_MODEL_IDS.has(value);
}

export function listSupportedCursorReviewerModelIds(): string[] {
  return [...SUPPORTED_MODEL_IDS].sort((a, b) => a.localeCompare(b));
}

/** Valida o id configurado; lança se inválido. */
export function assertSupportedCursorReviewerModelId(modelId: string): CursorReviewerModelId {
  const trimmed = modelId.trim();
  if (!isSupportedCursorReviewerModelId(trimmed)) {
    throw new Error(
      `Modelo inválido: "${trimmed}". Valores aceitos: ${listSupportedCursorReviewerModelIds().join(', ')}`,
    );
  }
  return trimmed;
}

export interface AgentModelSelection {
  id: string;
  params?: Array<{ id: string; value: string }>;
}

/** Converte o id já validado em seleção passada ao SDK. */
export function resolveAgentModelSelection(modelId: string): AgentModelSelection {
  const id = assertSupportedCursorReviewerModelId(modelId.trim() || DEFAULT_CURSOR_REVIEWER_MODEL);
  return { id };
}
