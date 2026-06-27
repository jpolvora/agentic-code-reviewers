import type { ReviewerEngineName } from './engine/types.js';

/** Prefixo fixo de identidade do runner em comentários na PR. */
export const BOT_TAG_PREFIX = 'Agentic Code Reviewer';

/** Tag legada em PRs abertas antes do rename (retrocompatibilidade). */
export const LEGACY_BOT_TAG_PREFIX = '[Cursor Reviewer]';

/** Tag publicada nos comentários: `Agentic Code Reviewer {engine}`. */
export function buildBotTag(engine: ReviewerEngineName): string {
  return `${BOT_TAG_PREFIX} ${engine}`;
}

/** Comentário postado por qualquer engine deste runner (prefixo comum ou legado). */
export function isAgenticReviewerComment(content: string): boolean {
  if (!content) return false;
  return content.includes(BOT_TAG_PREFIX) || content.includes(LEGACY_BOT_TAG_PREFIX);
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
