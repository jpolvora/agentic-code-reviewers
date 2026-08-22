import type { ReviewerConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import { type TokenUsageTotals } from './token-usage.js';
export interface AgentRunResult {
    agentId: string;
    runId: string;
    status: string;
    fullText: string;
    tokenUsage: TokenUsageTotals;
}
export type { TokenUsageTotals };
export interface RunAgentOptions {
    name: string;
    prompt: string;
    resumeAgentId?: string;
}
export declare function runAgentStream(config: ReviewerConfig, options: RunAgentOptions, logger: Logger): Promise<AgentRunResult>;
//# sourceMappingURL=stream.d.ts.map