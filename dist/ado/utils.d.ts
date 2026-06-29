/** Normaliza caminhos de arquivo para chave de dedup (lowercase, forward-slash, prefixo /). */
export declare function normalizeFilePath(filePath: string): string;
/** Canonicaliza caminhos preservando case (só forward-slash + prefixo /). Necessário para lookups em filesystems case-sensitive. */
export declare function canonicalFilePath(filePath: string): string;
/** Chave de dedup `path|line:N` alinhada entre ADO e GitHub. */
export declare function reviewDedupKey(filePath: string, lineNumber: number): string;
/** Verifica se o conteúdo de um comentário contém/inicia com a tag do bot. */
export declare function commentHasBotTag(content: string, botTag: string, mode?: 'startsWith' | 'contains'): boolean;
/**
 * Converte HTML (work items, comentários ADO) em texto legível: preserva
 * quebras de parágrafo, remove tags e decodifica as entidades HTML comuns.
 */
export declare function stripHtml(html: string): string;
//# sourceMappingURL=utils.d.ts.map