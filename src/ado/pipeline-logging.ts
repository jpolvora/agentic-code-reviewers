import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { formatEngineMetricsMarkdownLines } from '../agent/metrics-display.js';
import type { CodeReviewItem, GateEvaluation } from './types.js';

/**
 * Integração com os Azure Pipelines logging commands. Tornam o resultado do
 * review visível na build (aba Issues + resumo anexado), sem alterar o exit
 * code — a pipeline continua passando (exit 0) mesmo com issues de review.
 *
 * Referência: https://learn.microsoft.com/azure/devops/pipelines/scripts/logging-commands
 */

const PIPELINE_SEVERITY: Record<string, 'error' | 'warning'> = {
  critical: 'error',
  warning: 'warning',
  suggestion: 'warning',
};

/** True quando rodando dentro de um agente Azure DevOps (`TF_BUILD=True`). */
export function isAzurePipeline(): boolean {
  return process.env.TF_BUILD?.trim().toLowerCase() === 'true';
}

function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  return line.replace(/\s+/g, ' ').trim();
}

/** `sourcepath` do logissue: caminho repo-relativo (sem barra inicial). */
function toSourcePath(fileName: string): string {
  return fileName.replace(/^\/+/, '');
}

/**
 * Monta um comando `##vso[task.logissue]` para um review. type=error em
 * `critical`, warning nos demais — nunca falha a build (logissue error não
 * reprova o step por si só), mas destaca o achado na aba Issues.
 */
export function formatLogIssueCommand(review: CodeReviewItem): string {
  const type = PIPELINE_SEVERITY[review.severity] ?? 'warning';
  const sourcePath = toSourcePath(review.fileName);
  const props = [
    `type=${type}`,
    `sourcepath=${sourcePath}`,
    `linenumber=${review.lineNumber}`,
    'columnnumber=1',
  ].join(';');
  const scoreTag = review.score != null ? ` (score ${review.score}/10)` : '';
  const message = `[Cursor Reviewer] ${review.severity}${scoreTag}: ${firstLine(review.comment)}`;
  return `##vso[task.logissue ${props}]${message}`;
}

/** Markdown anexado à build via `task.uploadsummary`. */
export function buildReviewSummaryMarkdown(
  gate: GateEvaluation,
  reviews: CodeReviewItem[],
  dryRun: boolean,
  metrics?: Record<string, number>,
): string {
  const lines: string[] = [];
  lines.push('# Cursor Reviewer');
  lines.push('');
  lines.push(`- **Modo:** ${dryRun ? 'DRY-RUN' : 'PIPELINE'}`);
  lines.push(`- **Status:** ${gate.shouldFail ? '⚠️ Com issues' : '✅ Sem issues'}`);
  lines.push(`- **Reviews novos:** ${gate.newReviewsCount}`);
  lines.push(`- **Threads pendentes:** ${gate.pendingThreadCount}`);
  lines.push(`- **Threads resolvidas:** ${gate.resolvedCount}`);
  lines.push(
    `- **Severidades:** 🛑 ${gate.severities.critical} · ⚠️ ${gate.severities.warning} · 💡 ${gate.severities.suggestion}`,
  );

  lines.push(...formatEngineMetricsMarkdownLines(metrics));
  lines.push('');
  lines.push('> Issues de review **não** bloqueiam a pipeline (exit 0). Trate as threads na PR.');

  if (reviews.length > 0) {
    lines.push('');
    lines.push('## Achados publicados');
    lines.push('');
    lines.push('| Severidade | Score | Arquivo:Linha | Resumo |');
    lines.push('|------------|-------|---------------|--------|');
    for (const review of reviews) {
      const summary = firstLine(review.comment).replace(/\|/g, '/').slice(0, 140);
      lines.push(
        `| ${review.severity} | ${review.score ?? '?'} | \`${toSourcePath(review.fileName)}:${review.lineNumber}\` | ${summary} |`,
      );
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Emite os logging commands (logissue por review + uploadsummary). No-op fora
 * do Azure Pipelines para manter a saída local limpa.
 */
export function emitPipelineReviewOutput(
  gate: GateEvaluation,
  reviews: CodeReviewItem[],
  dryRun: boolean,
  metrics?: Record<string, number>,
  log: (msg: string) => void = console.log,
): void {
  if (!isAzurePipeline()) {
    return;
  }

  for (const review of reviews) {
    log(formatLogIssueCommand(review));
  }

  try {
    const markdown = buildReviewSummaryMarkdown(gate, reviews, dryRun, metrics);
    const summaryPath = join(tmpdir(), `cursor-reviewer-summary-${process.pid}.md`);
    writeFileSync(summaryPath, markdown, 'utf8');
    log(`##vso[task.uploadsummary]${summaryPath}`);
  } catch {
    /* uploadsummary é best-effort; não deve quebrar o run */
  }
}
