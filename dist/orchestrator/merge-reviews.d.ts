import type { CodeReviewItem, ResolvedThreadItem } from '../ado/types.js';
/** Merges reviews from parallel chunk runs — dedup by file|line, cluster near-duplicates. */
export declare function mergeReviews(chunks: CodeReviewItem[][]): CodeReviewItem[];
export declare function mergeCodeReviewResponses(responses: Array<{
    reviews: CodeReviewItem[];
    resolvedThreads?: ResolvedThreadItem[];
    reviewSummary?: string;
}>): {
    reviews: CodeReviewItem[];
    resolvedThreads: ResolvedThreadItem[];
    reviewSummary: string;
};
//# sourceMappingURL=merge-reviews.d.ts.map