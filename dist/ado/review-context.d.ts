import { AdoClient } from './client.js';
import type { AdoThreadsResponse, PendingPrThread, ReviewContextResult } from './types.js';
export declare function getReviewSummaryFromComment(content: string, botTag: string): string;
/** Texto integral do comentário da thread (sem truncar) para análise do auto-fix. */
export declare function getThreadDescription(content: string, botTag: string): string;
/** Threads pendentes do runner para gate e resumo final (exclui revisores humanos). */
export declare function filterGatePendingThreads(threads: PendingPrThread[]): PendingPrThread[];
export declare function getPullRequestReviewContext(client: AdoClient, pullRequestId: number, botTag: string, log: (msg: string) => void): Promise<ReviewContextResult>;
export declare function testReviewSummaryAlreadyPosted(threads: AdoThreadsResponse | null, botTag: string, summaryText: string): boolean;
//# sourceMappingURL=review-context.d.ts.map