import type { ReviewerConfig } from '../config.js';
import type { PromptContext } from '../agent/prompt.js';
export interface ReviewToolContext {
    repoRoot: string;
    diffRange: string;
    diffText: string;
    changedFiles: string[];
}
export interface ReviewToolResult {
    content: string;
    isError?: boolean;
}
export declare function createReviewToolContext(config: ReviewerConfig, context: PromptContext): ReviewToolContext;
export declare function toolGetDiff(ctx: ReviewToolContext, file?: string): ReviewToolResult;
export declare function toolGetChangedFiles(ctx: ReviewToolContext): ReviewToolResult;
export declare function toolReadFile(ctx: ReviewToolContext, filePath: string, maxBytes?: number): ReviewToolResult;
export declare function toolGrep(ctx: ReviewToolContext, pattern: string, glob?: string, maxResults?: number): ReviewToolResult;
export declare function toolRunCommand(ctx: ReviewToolContext, command: string, label: string): ReviewToolResult;
export declare const REVIEW_TOOL_NAMES: readonly ["get_diff", "get_changed_files", "read_file", "grep", "run_lint", "run_tests"];
export type ReviewToolName = (typeof REVIEW_TOOL_NAMES)[number];
export declare function isToolAllowed(name: string, allowlist: string[]): boolean;
export declare function executeReviewTool(name: ReviewToolName, ctx: ReviewToolContext, config: ReviewerConfig, args?: Record<string, string>): ReviewToolResult;
//# sourceMappingURL=review-tools.d.ts.map