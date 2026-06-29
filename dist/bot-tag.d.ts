import type { ReviewerEngineName } from './engine/types.js';
/** Prefixo fixo de identidade do runner em comentários na PR. */
export declare const BOT_TAG_PREFIX = "Agentic Code Reviewer";
/** Tag legada em PRs abertas antes do rename (retrocompatibilidade). */
export declare const LEGACY_BOT_TAG_PREFIX = "[Cursor Reviewer]";
/** Tag publicada nos comentários: `Agentic Code Reviewer {engine}`. */
export declare function buildBotTag(engine: ReviewerEngineName): string;
/** Comentário postado por qualquer engine deste runner (prefixo comum ou legado). */
export declare function isAgenticReviewerComment(content: string): boolean;
/** Primeira linha da tag quando presente (`Agentic Code Reviewer`, `Agentic Code Reviewer {engine}` ou legado). */
export declare function extractAgenticBotTagLine(content: string): string | null;
/** Remove tags do runner (atual e legada) para comparação/dedup de conteúdo. */
export declare function stripAgenticBotTags(content: string): string;
/** Comentário do runner com marcador de estado de rodada (tag atual ou legada). */
export declare function commentHasRoundStateMarker(content: string): boolean;
//# sourceMappingURL=bot-tag.d.ts.map