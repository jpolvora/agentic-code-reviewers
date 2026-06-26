import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';
import type {
  ActiveThreadInfo,
  CodeReviewItem,
  GateEvaluation,
  PendingPrThread,
  ReviewContextResult,
  PostedReviewThread,
} from '../ado/types.js';
import type { RoundStateLocation, RoundStateCommentInput } from '../ado/round-state.js';

export interface PlatformProvider {
  readonly name: 'azuredevops' | 'github';

  initialize(config: ReviewerConfig, logger: Logger): Promise<void>;

  getPullRequestContext(log?: (msg: string) => void): Promise<{
    pullRequestId: number;
    title: string;
    contextForLlm: string;
  }>;

  getPullRequestReviewContext(botTag: string, log: (msg: string) => void): Promise<ReviewContextResult>;

  getPullRequestWorkItemContext(
    maxWorkItems?: number,
    log?: (msg: string) => void,
  ): Promise<{
    workItemIds: number[];
    contextForLlm: string;
    summaries: any[];
  }>;

  resolvePullRequestReviewThreads(
    botTag: string,
    activeThreads: ActiveThreadInfo[],
    resolvedItems: any[],
    log: (msg: string) => void,
  ): Promise<number>;

  setPullRequestComments(
    botTag: string,
    reviewsJson: string,
    existingKeys: Map<string, boolean>,
    log: (msg: string) => void,
  ): Promise<PostedReviewThread[]>;

  setPullRequestReviewSummary(
    botTag: string,
    summaryText: string,
    allThreads: any,
    log: (msg: string) => void,
  ): Promise<boolean>;

  parseRoundStateFromThreads(allThreads: any, botTag: string): RoundStateLocation;

  persistRoundState(
    botTag: string,
    input: RoundStateCommentInput,
    existing: RoundStateLocation,
    log: (msg: string) => void,
  ): Promise<void>;

  emitPipelineReviewOutput(
    gate: GateEvaluation,
    reviews: CodeReviewItem[],
    dryRun: boolean,
    metrics?: Record<string, number>,
    log?: (msg: string) => void,
  ): void;
}
