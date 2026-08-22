import type { CodeReviewResponse } from '../ado/types.js';
export declare function extractJsonFromAgentOutput(text: string): string | null;
export declare function escapeQuotesInJson(str: string): string;
export declare function sanitizeJsonString(str: string): string;
/**
 * LLMs often emit invalid JSON escapes inside suggestedFix (e.g. \` \. \: \' ).
 * Drop the backslash and keep the following character so JSON.parse can succeed.
 * Incomplete \uXXXX sequences are treated the same way.
 */
export declare function fixInvalidJsonEscapes(str: string): string;
export declare function cleanJsonString(str: string): string;
export declare function parseAgentReviewOutput(text: string): CodeReviewResponse;
//# sourceMappingURL=review-response.d.ts.map