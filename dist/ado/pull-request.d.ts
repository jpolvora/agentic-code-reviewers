import { AdoClient } from './client.js';
export interface PullRequestContextResult {
    pullRequestId: number;
    title: string;
    contextForLlm: string;
}
export declare function formatReviewStartLogMessage(pullRequestId: number, title?: string): string;
export declare function buildPullRequestContextForLlm(pullRequestId: number, title: string, description: string): string;
export declare function getPullRequestContext(client: AdoClient, pullRequestId: number, log?: (msg: string) => void): Promise<PullRequestContextResult>;
/** @deprecated Use getPullRequestContext — mantido para compatibilidade interna. */
export declare function getPullRequestDescriptionContext(client: AdoClient, pullRequestId: number, log?: (msg: string) => void): Promise<string>;
//# sourceMappingURL=pull-request.d.ts.map