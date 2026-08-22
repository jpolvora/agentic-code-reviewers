import type { ReviewerConfig } from '../config.js';
import type { PromptContext } from '../agent/prompt.js';
export interface McpObservation {
    tool: string;
    content: string;
    isError?: boolean;
}
/** Pre-fetches optional lint/test output for injection when MCP is enabled. */
export declare function prefetchMcpObservations(config: ReviewerConfig, context: PromptContext): McpObservation[];
export declare function buildMcpPromptSection(config: ReviewerConfig, observations: McpObservation[]): string;
export declare function buildOpencodeMcpInstructions(config: ReviewerConfig): string[];
//# sourceMappingURL=mcp-prompt.d.ts.map