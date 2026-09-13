import type { ReviewerEngineName } from './engine/types.js';
/** npm package name and stable comment prefix (no version). */
export declare const PRODUCT_NAME = "agentic-code-reviewers";
/** Prefixo fixo de identidade do runner em comentários na PR. */
export declare const BOT_TAG_PREFIX = "agentic-code-reviewers";
/** Tags publicadas antes do rename (retrocompatibilidade). */
export declare const LEGACY_BOT_TAG_PREFIX = "[Cursor Reviewer]";
/** Tag publicada: `agentic-code-reviewers v{version} ({engine})`. */
export declare function buildBotTag(engine: ReviewerEngineName, version?: string): string;
/** Comentário postado por qualquer engine deste runner (tag na primeira linha). */
export declare function isAgenticReviewerComment(content: string): boolean;
/** Primeira linha da tag quando presente (atual, `Agentic Code Reviewer {engine}`, ou `[Cursor Reviewer]`). */
export declare function extractAgenticBotTagLine(content: string): string | null;
/** Remove tags do runner (atual e legadas) para comparação/dedup de conteúdo. */
export declare function stripAgenticBotTags(content: string): string;
/** Comentário do runner com marcador de estado de rodada (tag atual ou legada). */
export declare function commentHasRoundStateMarker(content: string): boolean;
//# sourceMappingURL=bot-tag.d.ts.map