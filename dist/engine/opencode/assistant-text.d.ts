import type { AssistantMessage, Part } from '@opencode-ai/sdk';
/** Follow-up when the first turn returns no usable assistant text (reasoning-only / truncated). */
export declare const EMPTY_ASSISTANT_TEXT_CONTINUATION: string;
export declare function extractTextFromParts(parts: Part[]): string;
export declare function summarizePartTypes(parts: Part[]): string;
export declare function isRetryableIncompleteAssistant(info: AssistantMessage, fullText: string): boolean;
export declare function formatIncompleteAssistantDiagnostics(info: AssistantMessage, parts: Part[]): string;
export type IncompleteAssistantTurn = {
    info: AssistantMessage;
    parts: Part[];
};
export type IncompleteAssistantRetryResult = {
    turn: IncompleteAssistantTurn;
    fullText: string;
    retried: boolean;
};
/**
 * If the first turn has no usable text (or length/abort error), call `followUp` once.
 * Used by runOpencodeStream so the orchestration path is unit-testable.
 */
export declare function resolveIncompleteAssistantTurn(first: IncompleteAssistantTurn, followUp: () => Promise<IncompleteAssistantTurn>, onRetry?: () => void): Promise<IncompleteAssistantRetryResult>;
export declare function mergeAssistantMetrics(first: Record<string, number>, second: Record<string, number>): Record<string, number>;
//# sourceMappingURL=assistant-text.d.ts.map