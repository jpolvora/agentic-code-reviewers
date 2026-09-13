import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type { PlatformProvider } from './types.js';
import type { ActiveThreadInfo, CodeReviewItem, GateEvaluation, PostedReviewThread, ReviewContextResult } from '../ado/types.js';
import type { RoundStateCommentInput, RoundStateLocation } from '../ado/round-state.js';
export declare class AdoProvider implements PlatformProvider {
    readonly name = "azuredevops";
    private config;
    private ado;
    initialize(config: ReviewerConfig, _logger: Logger): Promise<void>;
    getPullRequestContext(log?: (msg: string) => void): Promise<import("../ado/pull-request.js").PullRequestContextResult>;
    getPullRequestReviewContext(botTag: string, log: (msg: string) => void): Promise<ReviewContextResult>;
    getPullRequestWorkItemContext(maxWorkItems?: number, log?: (msg: string) => void): Promise<{
        workItemIds: number[];
        contextForLlm: string;
        summaries: import("../ado/work-items.js").WorkItemSummary[];
    }>;
    resolvePullRequestReviewThreads(botTag: string, activeThreads: ActiveThreadInfo[], resolvedItems: any[], log: (msg: string) => void): Promise<number>;
    setPullRequestComments(botTag: string, reviewsJson: string, existingKeys: Map<string, boolean>, log: (msg: string) => void): Promise<PostedReviewThread[]>;
    postPrComment(botTag: string, commentBody: string, log: (msg: string) => void): Promise<boolean>;
    setPullRequestReviewSummary(botTag: string, summaryText: string, allThreads: any, log: (msg: string) => void): Promise<boolean>;
    parseRoundStateFromThreads(allThreads: any, botTag: string): RoundStateLocation;
    persistRoundState(botTag: string, input: RoundStateCommentInput, existing: RoundStateLocation, log: (msg: string) => void): Promise<void>;
    emitPipelineReviewOutput(gate: GateEvaluation, reviews: CodeReviewItem[], dryRun: boolean, metrics?: Record<string, number>, log?: (msg: string) => void): void;
}
//# sourceMappingURL=azuredevops.d.ts.map