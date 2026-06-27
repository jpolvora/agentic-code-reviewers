import type { ReviewerEngineName } from './engine/types.js';
import { ROUND_STATE_MARKER } from './ado/round-state.js';

/** Prefixo fixo de identidade do runner em comentários na PR. */
export const BOT_TAG_PREFIX = 'Agentic Code Reviewer';

/** Tag legada em PRs abertas antes do rename (retrocompatibilidade). */
export const LEGACY_BOT_TAG_PREFIX = '[Cursor Reviewer]';

const AGENTIC_REVIEWER_TAG_PREFIXES = [BOT_TAG_PREFIX, LEGACY_BOT_TAG_PREFIX] as const;

/** Tag publicada nos comentários: `Agentic Code Reviewer {engine}`. */
export function buildBotTag(engine: ReviewerEngineName): string {
  return `${BOT_TAG_PREFIX} ${engine}`;
}

/** Comentário postado por qualquer engine deste runner (prefixo comum ou legado). */
export function isAgenticReviewerComment(content: string): boolean {
  if (!content) return false;
  return AGENTIC_REVIEWER_TAG_PREFIXES.some((prefix) => content.includes(prefix));
}

/** Primeira linha da tag quando presente (`Agentic Code Reviewer`, `Agentic Code Reviewer {engine}` ou legado). */
export function extractAgenticBotTagLine(content: string): string | null {
  if (!isAgenticReviewerComment(content)) return null;
  const firstLine = content.split(/\r?\n/)[0]?.trim() ?? '';
  const match = firstLine.match(/^Agentic Code Reviewer(?: \S+)?/);
  if (match) return match[0];
  if (firstLine.startsWith(LEGACY_BOT_TAG_PREFIX)) return LEGACY_BOT_TAG_PREFIX;
  return content.includes(BOT_TAG_PREFIX) ? BOT_TAG_PREFIX : LEGACY_BOT_TAG_PREFIX;
}

/** Remove tags do runner (atual e legada) para comparação/dedup de conteúdo. */
export function stripAgenticBotTags(content: string): string {
  let text = content;
  text = text.replace(/^Agentic Code Reviewer(?: \S+)?\s*/m, '');
  text = text.replaceAll(LEGACY_BOT_TAG_PREFIX, '');
  text = text.replaceAll(BOT_TAG_PREFIX, '');
  return text.trim();
}

/** Comentário do runner com marcador de estado de rodada (tag atual ou legada). */
export function commentHasRoundStateMarker(content: string): boolean {
  return isAgenticReviewerComment(content) && content.includes(ROUND_STATE_MARKER);
}

