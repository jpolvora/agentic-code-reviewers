import { reviewDedupKey } from '../ado/utils.js';
import type { CodeReviewItem, ResolvedThreadItem } from '../ado/types.js';

function commentPrefix(comment: string, length = 80): string {
  return comment.trim().slice(0, length).toLowerCase();
}

function areNearDuplicates(a: CodeReviewItem, b: CodeReviewItem): boolean {
  if (a.fileName !== b.fileName) return false;
  if (Math.abs(a.lineNumber - b.lineNumber) <= 3) {
    const prefixA = commentPrefix(a.comment);
    const prefixB = commentPrefix(b.comment);
    return prefixA === prefixB || prefixA.includes(prefixB) || prefixB.includes(prefixA);
  }
  return false;
}

/** Merges reviews from parallel chunk runs — dedup by file|line, cluster near-duplicates. */
export function mergeReviews(chunks: CodeReviewItem[][]): CodeReviewItem[] {
  const merged: CodeReviewItem[] = [];

  for (const reviews of chunks) {
    for (const review of reviews) {
      const exactKey = reviewDedupKey(review.fileName, review.lineNumber);
      const exactIdx = merged.findIndex(
        (r) => reviewDedupKey(r.fileName, r.lineNumber) === exactKey,
      );
      if (exactIdx >= 0) {
        const existing = merged[exactIdx]!;
        if ((review.score ?? 0) > (existing.score ?? 0)) {
          merged[exactIdx] = review;
        }
        continue;
      }

      const nearIdx = merged.findIndex((r) => areNearDuplicates(r, review));
      if (nearIdx >= 0) {
        const existing = merged[nearIdx]!;
        if ((review.score ?? 0) > (existing.score ?? 0)) {
          merged[nearIdx] = review;
        }
        continue;
      }

      merged.push(review);
    }
  }

  return merged;
}

export function mergeCodeReviewResponses(
  responses: Array<{ reviews: CodeReviewItem[]; resolvedThreads?: ResolvedThreadItem[]; reviewSummary?: string }>,
): { reviews: CodeReviewItem[]; resolvedThreads: ResolvedThreadItem[]; reviewSummary: string } {
  const allReviews = responses.map((r) => r.reviews ?? []);
  const reviews = mergeReviews(allReviews);

  const resolvedThreads = responses.flatMap((r) => r.resolvedThreads ?? []);
  const summaries = responses.map((r) => r.reviewSummary?.trim()).filter(Boolean);
  const reviewSummary = summaries.length === 1 ? summaries[0]! : '';

  return { reviews, resolvedThreads, reviewSummary };
}
