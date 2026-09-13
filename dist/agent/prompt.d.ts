import type { ReviewerConfig } from '../config.js';
import type { DiffPromptSection } from '../git/diff-prompt.js';
import type { LocalReviewGitContext } from '../git/diff.js';
import { type McpObservation } from '../mcp/mcp-prompt.js';
export interface PromptContext {
    workItemContext: string;
    prDescriptionContext: string;
    existingReviewContext: string;
    rulesContext: string;
    diffSection: DiffPromptSection;
    diffStats: {
        fileCount: number;
        files: string[];
    };
    gitContext: LocalReviewGitContext;
    /** When set (e.g. parallel chunks), skips per-chunk MCP prefetch in buildAgentPrompt. */
    mcpObservations?: McpObservation[];
}
export declare function buildExecutionContext(config: ReviewerConfig, context: PromptContext): string[];
export declare function buildAgentPrompt(config: ReviewerConfig, context: PromptContext): string;
//# sourceMappingURL=prompt.d.ts.map