import { Cursor } from '@cursor/sdk';
import { ModelCatalogError, UnsupportedModelError } from '../types.js';

/** Default quando CLI/env omitidos ou macro ADO não expandida. */
export const DEFAULT_CURSOR_REVIEWER_MODEL = 'composer-2.5';

/** ID canônico do Composer 2.5 no Cursor SDK. */
export const CANONICAL_COMPOSER_25_MODEL_ID = DEFAULT_CURSOR_REVIEWER_MODEL;

export interface CursorModelCatalogItem {
  id: string;
  aliases?: string[];
}

export type CursorModelLister = (options?: { apiKey?: string }) => Promise<CursorModelCatalogItem[]>;

const defaultLister: CursorModelLister = (options) => Cursor.models.list({ apiKey: options?.apiKey });

/**
 * Shape-only check (sync, sem catálogo): id não vazio ou default.
 * A validação contra o catálogo (`Cursor.models.list()`) acontece em
 * `validateCursorModelId`, no tempo de execução do engine.
 */
export function resolveCursorModelShape(modelId: string): string {
  const trimmed = modelId.trim();
  return trimmed || DEFAULT_CURSOR_REVIEWER_MODEL;
}

/**
 * Valida o id contra o catálogo live (`Cursor.models.list()`) da conta
 * autenticada. Retorna o identificador canônico do catálogo byte-for-byte.
 * Erros distinguem modelo não suportado (`UnsupportedModelError`, com ids
 * descobertos quando disponíveis) de falha de catálogo (`ModelCatalogError`,
 * sem fallback silencioso).
 */
export async function validateCursorModelId(
  modelId: string,
  lister: CursorModelLister = defaultLister,
  options?: { apiKey?: string },
): Promise<string> {
  const trimmed = resolveCursorModelShape(modelId);
  let catalog: CursorModelCatalogItem[];
  try {
    catalog = await lister(options);
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new ModelCatalogError(
      'cursor-sdk',
      `${cause}. Verifique CURSOR_API_KEY, rede e acesso à API de modelos.`,
    );
  }
  const available = catalog.map((item) => item.id);
  const exact = catalog.find((item) => item.id === trimmed);
  if (exact) return exact.id;
  const byAlias = catalog.find((item) => item.aliases?.includes(trimmed));
  if (byAlias) return byAlias.id;
  throw new UnsupportedModelError('cursor-sdk', trimmed, available);
}

export interface AgentModelSelection {
  id: string;
  params?: Array<{ id: string; value: string }>;
}

/** Converte o id (já validado no runtime) em seleção passada ao SDK. */
export function resolveAgentModelSelection(modelId: string): AgentModelSelection {
  return { id: resolveCursorModelShape(modelId) };
}
