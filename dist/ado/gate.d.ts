import type { CodeReviewItem, GateEvaluation, PendingPrThread, ReviewSeverity } from './types.js';
export declare function countSeverities(reviews: CodeReviewItem[]): Record<ReviewSeverity, number>;
/** pendingThreads: threads do runner (`Agentic Code Reviewer`) active/pending (filtradas upstream). */
export declare function evaluateGate(params: {
    newReviews: CodeReviewItem[];
    resolvedCount: number;
    pendingThreads: PendingPrThread[];
}): GateEvaluation;
export declare function formatGateSummary(gate: GateEvaluation, agentId: string, runId: string, dryRun: boolean, metrics?: Record<string, number>): string;
//# sourceMappingURL=gate.d.ts.map