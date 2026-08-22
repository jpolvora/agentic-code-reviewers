import type { ReviewerEngineName } from './engine/types.js';
import { ROUND_STATE_MARKER } from './git/markers.js';

/** npm package name and stable comment prefix (no version). */
export const PRODUCT_NAME = 'agentic-code-reviewers';

/** Prefixo fixo de identidade do runner em comentários na PR. */
export const BOT_TAG_PREFIX = PRODUCT_NAME;

/** Tags publicadas antes do rename (retrocompatibilidade). */
export const LEGACY_BOT_TAG_PREFIX = '[Cursor Reviewer]';

/** Tag publicada: `agentic-code-reviewers v{version} ({engine})`. */
export function buildBotTag(engine: ReviewerEngineName, version?: string): string {
  const ver = version?.trim();
  return ver ? `${BOT_TAG_PREFIX} v${ver} (${engine})` : `${BOT_TAG_PREFIX} (${engine})`;
}

function firstLineLooksLikeRunnerTag(firstLine: string): boolean {
  return (
    /^agentic-code-reviewers(?:\s+v\S+)?(?:\s+\([^)]+\))?$/.test(firstLine) ||
    /^Agentic Code Reviewer(?: \S+)?$/.test(firstLine) ||
    firstLine === LEGACY_BOT_TAG_PREFIX
  );
}

function firstLineTagMatch(firstLine: string): string | null {
  const current = firstLine.match(/^agentic-code-reviewers(?:\s+v\S+)?(?:\s+\([^)]+\))?$/);
  if (current) return current[0];
  const previous = firstLine.match(/^Agentic Code Reviewer(?: \S+)?$/);
  if (previous) return previous[0];
  if (firstLine === LEGACY_BOT_TAG_PREFIX) return LEGACY_BOT_TAG_PREFIX;
  return null;
}

/** Comentário postado por qualquer engine deste runner (tag na primeira linha). */
export function isAgenticReviewerComment(content: string): boolean {
  if (!content) return false;
  const firstLine = content.split(/\r?\n/)[0]?.trim() ?? '';
  return firstLineLooksLikeRunnerTag(firstLine);
}

/** Primeira linha da tag quando presente (atual, `Agentic Code Reviewer {engine}`, ou `[Cursor Reviewer]`). */
export function extractAgenticBotTagLine(content: string): string | null {
  if (!isAgenticReviewerComment(content)) return null;
  const firstLine = content.split(/\r?\n/)[0]?.trim() ?? '';
  return firstLineTagMatch(firstLine);
}

/** Remove tags do runner (atual e legadas) para comparação/dedup de conteúdo. */
export function stripAgenticBotTags(content: string): string {
  let text = content;
  text = text.replace(/^agentic-code-reviewers(?:\s+v\S+)?(?:\s+\([^)]+\))?\s*\r?\n?/, '');
  text = text.replace(/^Agentic Code Reviewer(?: \S+)?\s*\r?\n?/, '');
  if (text.startsWith(LEGACY_BOT_TAG_PREFIX)) {
    text = text.slice(LEGACY_BOT_TAG_PREFIX.length).replace(/^\s*\r?\n?/, '');
  }
  return text.trim();
}

/** Comentário do runner com marcador de estado de rodada (tag atual ou legada). */
export function commentHasRoundStateMarker(content: string): boolean {
  return isAgenticReviewerComment(content) && content.includes(ROUND_STATE_MARKER);
}
