export const RESOLUTION_MARKER = '<!-- resolution-reply -->';
/** Marcador legado usado em versões anteriores do provider GitHub. */
export const LEGACY_RESOLUTION_MARKER = '<!-- reviewer-resolved -->';
export const REVIEW_SUMMARY_MARKER = '<!-- review-summary -->';

/** Detecta reply de resolução (canônico ADO, legado GitHub ou texto histórico). */
export function commentBodyHasResolutionReply(body: string, botTag: string): boolean {
  if (!body) return false;
  return (
    body.includes(RESOLUTION_MARKER) ||
    body.includes(LEGACY_RESOLUTION_MARKER) ||
    (body.includes(botTag) && body.includes('Addressing issue'))
  );
}
