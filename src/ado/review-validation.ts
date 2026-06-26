import type { CodeReviewItem, DeveloperAction, ReviewSeverity } from './types.js';

const VALID_SEVERITIES = new Set<ReviewSeverity>(['critical', 'warning', 'suggestion']);
const VALID_ACTIONS = new Set<DeveloperAction>(['fix-code', 'resolve-comment', 'escalate']);

export const DEFAULT_SCORE_MIN = 6;
/** @deprecated Prefer {@link DEFAULT_SCORE_MIN} */
export const MIN_PUBLISHABLE_SCORE = DEFAULT_SCORE_MIN;
export const MAX_PUBLISHABLE_SCORE = 10;

/** Review elegível para publicação na PR (contrato prompt + gate programático). */
export function isPublishableReview(
  review: CodeReviewItem,
  scoreMin: number = DEFAULT_SCORE_MIN,
): boolean {
  if (typeof review.score !== 'number' || !Number.isFinite(review.score)) {
    return false;
  }
  if (review.score < scoreMin || review.score > MAX_PUBLISHABLE_SCORE) {
    return false;
  }
  if (!review.fileName?.trim()) {
    return false;
  }
  if (!Number.isInteger(review.lineNumber) || review.lineNumber <= 0) {
    return false;
  }
  if (!VALID_SEVERITIES.has(review.severity)) {
    return false;
  }
  if (!review.comment?.trim()) {
    return false;
  }
  if (!review.analysis?.trim()) {
    return false;
  }
  if (!Array.isArray(review.impactPaths) || review.impactPaths.length === 0) {
    return false;
  }
  if (!review.impactPaths.every((path) => typeof path === 'string' && path.trim().length > 0)) {
    return false;
  }
  // suggestedFix é opcional — omita ou use "" quando não houver patch cirúrgico
  if (!review.developerAction || !VALID_ACTIONS.has(review.developerAction)) {
    return false;
  }
  if (review.developerAction === 'resolve-comment') {
    return false;
  }
  return true;
}

export function filterPublishableReviews(
  reviews: CodeReviewItem[],
  scoreMin: number = DEFAULT_SCORE_MIN,
): CodeReviewItem[] {
  return reviews.filter((review) => isPublishableReview(review, scoreMin));
}
