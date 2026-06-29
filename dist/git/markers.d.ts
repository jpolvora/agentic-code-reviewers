export declare const RESOLUTION_MARKER = "<!-- resolution-reply -->";
/** Marcador legado usado em versões anteriores do provider GitHub. */
export declare const LEGACY_RESOLUTION_MARKER = "<!-- reviewer-resolved -->";
export declare const REVIEW_SUMMARY_MARKER = "<!-- review-summary -->";
/** Mensagem fixa publicada na PR quando não há issues novas nem threads pendentes com arquivo. */
export declare const CLEAN_PR_SUMMARY_MESSAGE = "All pending issues have been successfully resolved! The PR is ready to be merged. \uD83D\uDE80";
/** Marcador usado nos comentários de sumário do auto-fix. */
export declare const AUTO_FIX_SUMMARY_MARKER = "<!-- auto-fix-summary -->";
/** Detecta reply de resolução (canônico ADO, legado GitHub ou texto histórico). */
export declare function commentBodyHasResolutionReply(body: string, botTag: string): boolean;
//# sourceMappingURL=markers.d.ts.map