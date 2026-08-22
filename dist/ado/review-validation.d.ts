import type { CodeReviewItem } from './types.js';
export declare const DEFAULT_SCORE_MIN = 6;
/** @deprecated Prefer {@link DEFAULT_SCORE_MIN} */
export declare const MIN_PUBLISHABLE_SCORE = 6;
export declare const MAX_PUBLISHABLE_SCORE = 10;
/** Review elegível para publicação na PR (contrato prompt + gate programático). */
export declare function isPublishableReview(review: CodeReviewItem, scoreMin?: number): boolean;
export declare function filterPublishableReviews(reviews: CodeReviewItem[], scoreMin?: number): CodeReviewItem[];
//# sourceMappingURL=review-validation.d.ts.map