import type { ReviewerEngineName } from './engine/types.js';
import { ROUND_STATE_MARKER } from './ado/round-state.js';

/** npm package name and stable comment prefix (no version). */
export const PRODUCT_NAME = 'agentic-code-reviewers';

/** Prefixo fixo de identidade do runner em comentários na PR. */
export const BOT_TAG_PREFIX = PRODUCT_NAME;

/** Tags publicadas antes do rename (retrocompatibilidade). */
export const LEGACY_BOT_TAG_PREFIX = '[Cursor Reviewer]';
export const LEGACY_AGENTIC_BOT_TAG_PREFIX = 'Agentic Code Reviewer';

const AGENTIC_REVIEWER_TAG_PREFIXES = [
  BOT_TAG_PREFIX,
  LEGACY_AGENTIC_BOT_TAG_PREFIX,
  LEGACY_BOT_TAG_PREFIX,
] as const;

/** Tag publicada: `agentic-code-reviewers v{version} ({engine})`. */
export function buildBotTag(engine: ReviewerEngineName, version?: string): string {
  const ver = version?.trim();
  return ver ? `${BOT_TAG_PREFIX} v${ver} (${engine})` : `${BOT_TAG_PREFIX} (${engine})`;
}

function firstLineTagMatch(firstLine: string): string | null {
  const current = firstLine.match(/^agentic-code-reviewers(?:\s+v\S+)?(?:\s+\([^)]+\))?/);
  if (current) return current[0];
  const previous = firstLine.match(/^Agentic Code Reviewer(?: \S+)?/);
  if (previous) return previous[0];
  if (firstLine.startsWith(LEGACY_BOT_TAG_PREFIX)) return LEGACY_BOT_TAG_PREFIX;
  return null;
}

/** Comentário postado por qualquer engine deste runner (prefixo comum ou legado). */
export function isAgenticReviewerComment(content: string): boolean {
  if (!content) return false;
  return AGENTIC_REVIEWER_TAG_PREFIXES.some((prefix) => content.includes(prefix));
}

/** Primeira linha da tag quando presente (atual, `Agentic Code Reviewer {engine}`, ou `[Cursor Reviewer]`). */
export function extractAgenticBotTagLine(content: string): string | null {
  if (!isAgenticReviewerComment(content)) return null;
  const firstLine = content.split(/\r?\n/)[0]?.trim() ?? '';
  const matched = firstLineTagMatch(firstLine);
  if (matched) return matched;
  if (content.includes(BOT_TAG_PREFIX)) return BOT_TAG_PREFIX;
  if (content.includes(LEGACY_AGENTIC_BOT_TAG_PREFIX)) return LEGACY_AGENTIC_BOT_TAG_PREFIX;
  return LEGACY_BOT_TAG_PREFIX;
}

/** Remove tags do runner (atual e legadas) para comparação/dedup de conteúdo. */
export function stripAgenticBotTags(content: string): string {
  let text = content;
  text = text.replace(/^agentic-code-reviewers(?:\s+v\S+)?(?:\s+\([^)]+\))?\s*/m, '');
  text = text.replace(/^Agentic Code Reviewer(?: \S+)?\s*/m, '');
  text = text.replaceAll(LEGACY_BOT_TAG_PREFIX, '');
  text = text.replaceAll(LEGACY_AGENTIC_BOT_TAG_PREFIX, '');
  text = text.replaceAll(BOT_TAG_PREFIX, '');
  return text.trim();
}

/** Comentário do runner com marcador de estado de rodada (tag atual ou legada). */
export function commentHasRoundStateMarker(content: string): boolean {
  return isAgenticReviewerComment(content) && content.includes(ROUND_STATE_MARKER);
}
