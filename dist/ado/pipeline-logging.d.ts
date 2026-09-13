import type { CodeReviewItem, GateEvaluation } from './types.js';
/** True quando rodando dentro de um agente Azure DevOps (`TF_BUILD=True`). */
export declare function isAzurePipeline(): boolean;
/**
 * Monta um comando `##vso[task.logissue]` para um review. type=error em
 * `critical`, warning nos demais — nunca falha a build (logissue error não
 * reprova o step por si só), mas destaca o achado na aba Issues.
 */
export declare function formatLogIssueCommand(review: CodeReviewItem): string;
/** Markdown anexado à build via `task.uploadsummary`. */
export declare function buildReviewSummaryMarkdown(gate: GateEvaluation, reviews: CodeReviewItem[], dryRun: boolean, metrics?: Record<string, number>): string;
/**
 * Emite os logging commands (logissue por review + uploadsummary). No-op fora
 * do Azure Pipelines para manter a saída local limpa.
 */
export declare function emitPipelineReviewOutput(gate: GateEvaluation, reviews: CodeReviewItem[], dryRun: boolean, metrics?: Record<string, number>, log?: (msg: string) => void): void;
//# sourceMappingURL=pipeline-logging.d.ts.map