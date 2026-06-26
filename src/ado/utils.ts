/** Normaliza caminhos de arquivo para chave de dedup (lowercase, forward-slash, prefixo /). */
export function normalizeFilePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

/** Chave de dedup `path|line:N` alinhada entre ADO e GitHub. */
export function reviewDedupKey(filePath: string, lineNumber: number): string {
  return `${normalizeFilePath(filePath)}|line:${lineNumber}`;
}

/** Verifica se o conteúdo de um comentário contém/inicia com a tag do bot. */
export function commentHasBotTag(content: string, botTag: string, mode: 'startsWith' | 'contains' = 'startsWith'): boolean {
  if (!content || !botTag) return false;
  return mode === 'contains' ? content.includes(botTag) : content.startsWith(botTag);
}

/**
 * Converte HTML (work items, comentários ADO) em texto legível: preserva
 * quebras de parágrafo, remove tags e decodifica as entidades HTML comuns.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<(p|div|li|tr|h[1-6])[^>]*>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return text.replace(/(\r?\n\s*){3,}/g, '\n\n').trim();
}
