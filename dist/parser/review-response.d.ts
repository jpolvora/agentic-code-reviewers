import type { CodeReviewResponse } from '../ado/types.js';
export declare function extractJsonFromAgentOutput(text: string): string | null;
export declare function escapeQuotesInJson(str: string): string;
export declare function sanitizeJsonString(str: string): string;
export declare function cleanJsonString(str: string): string;
export declare function parseAgentReviewOutput(text: string): CodeReviewResponse;
//# sourceMappingURL=review-response.d.ts.map