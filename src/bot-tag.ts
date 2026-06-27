import type { ReviewerEngineName } from './engine/types.js';

/** Prefixo fixo de identidade do runner em comentários na PR. */
export const BOT_TAG_PREFIX = 'Agentic Code Reviewer';

/** Tag publicada nos comentários: `Agentic Code Reviewer {engine}`. */
export function buildBotTag(engine: ReviewerEngineName): string {
  return `${BOT_TAG_PREFIX} ${engine}`;
}

/** Comentário postado por qualquer engine deste runner (prefixo comum). */
export function isAgenticReviewerComment(content: string): boolean {
  if (!content) return false;
  return content.includes(BOT_TAG_PREFIX);
}

/** Primeira linha da tag quando presente (`Agentic Code Reviewer` ou `Agentic Code Reviewer {engine}`). */
export function extractAgenticBotTagLine(content: string): string | null {
  if (!isAgenticReviewerComment(content)) return null;
  const firstLine = content.split(/\r?\n/)[0]?.trim() ?? '';
  const match = firstLine.match(/^Agentic Code Reviewer(?: \S+)?/);
  return match?.[0] ?? BOT_TAG_PREFIX;
}
