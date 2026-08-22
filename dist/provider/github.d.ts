import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { type RoundStateCommentInput, type RoundStateLocation } from '../ado/round-state.js';
import type { PlatformProvider } from './types.js';
import type { ActiveThreadInfo, CodeReviewItem, GateEvaluation, PostedReviewThread, ResolvedThreadItem, ReviewContextResult } from '../ado/types.js';
export declare class GithubProvider implements PlatformProvider {
    readonly name = "github";
    private config;
    private client;
    private headRefOid;
    initialize(config: ReviewerConfig, _logger: Logger): Promise<void>;
    getPullRequestContext(log?: (msg: string) => void): Promise<{
        pullRequestId: number;
        title: string;
        contextForLlm: string;
    }>;
    getPullRequestReviewContext(botTag: string, log: (msg: string) => void): Promise<ReviewContextResult>;
    getPullRequestWorkItemContext(_maxWorkItems?: number, _log?: (msg: string) => void): Promise<{
        workItemIds: never[];
        contextForLlm: string;
        summaries: never[];
    }>;
    resolvePullRequestReviewThreads(botTag: string, activeThreads: ActiveThreadInfo[], resolvedItems: ResolvedThreadItem[], log: (msg: string) => void): Promise<number>;
    private resolveGithubThread;
    setPullRequestComments(botTag: string, reviewsJson: string, existingKeys: Map<string, boolean>, log: (msg: string) => void): Promise<PostedReviewThread[]>;
    postPrComment(botTag: string, commentBody: string, log: (msg: string) => void): Promise<boolean>;
    setPullRequestReviewSummary(botTag: string, summaryText: string, allThreads: any, log: (msg: string) => void): Promise<boolean>;
    parseRoundStateFromThreads(allThreads: any, botTag: string): RoundStateLocation;
    persistRoundState(botTag: string, input: RoundStateCommentInput, existing: RoundStateLocation, log: (msg: string) => void): Promise<void>;
    emitPipelineReviewOutput(gate: GateEvaluation, reviews: CodeReviewItem[], dryRun: boolean, metrics?: Record<string, number>, log?: (msg: string) => void): void;
    private buildGHSummaryMarkdown;
}
//# sourceMappingURL=github.d.ts.map