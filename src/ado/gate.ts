import type { CodeReviewItem, GateEvaluation, PendingPrThread, ReviewSeverity } from './types.js';
import {
  formatTokenCount,
  hasEngineMetrics,
} from '../agent/metrics-display.js';
import { ENGINE_METRIC_KEYS } from '../engine/types.js';

export function countSeverities(reviews: CodeReviewItem[]): Record<ReviewSeverity, number> {
  const counts: Record<ReviewSeverity, number> = { critical: 0, warning: 0, suggestion: 0 };
  for (const review of reviews) {
    if (review.severity in counts) {
      counts[review.severity]++;
    }
  }
  return counts;
}

/** pendingThreads: apenas threads bot [Cursor Reviewer] active/pending (filtradas upstream). */
export function evaluateGate(params: {
  newReviews: CodeReviewItem[];
  resolvedCount: number;
  pendingThreads: PendingPrThread[];
}): GateEvaluation {
  const { newReviews, resolvedCount, pendingThreads } = params;
  const severities = countSeverities(newReviews);
  const pendingThreadCount = pendingThreads.length;

  if (newReviews.length > 0) {
    return {
      shouldFail: true,
      reason: `${newReviews.length} nova(s) thread(s) de review seriam publicadas`,
      newReviewsCount: newReviews.length,
      resolvedCount,
      pendingThreadCount,
      pendingThreads,
      severities,
    };
  }

  if (pendingThreadCount > 0) {
    return {
      shouldFail: true,
      reason: `${pendingThreadCount} thread(s) ativa(s)/pending permanecem na PR`,
      newReviewsCount: 0,
      resolvedCount,
      pendingThreadCount,
      pendingThreads,
      severities,
    };
  }

  return {
    shouldFail: false,
    reason: 'Nenhuma issue nova e nenhuma thread pendente na PR',
    newReviewsCount: 0,
    resolvedCount,
    pendingThreadCount: 0,
    pendingThreads: [],
    severities,
  };
}

export function formatGateSummary(
  gate: GateEvaluation,
  agentId: string,
  runId: string,
  dryRun: boolean,
  metrics?: Record<string, number>,
): string {
  const statusIcon = gate.shouldFail ? '⚠️' : '✅';
  const statusLabel = gate.shouldFail ? 'COM ISSUES PENDENTES' : 'SEM ISSUES';
  const modeLabel = dryRun ? 'DRY-RUN' : 'PIPELINE';

  const lines = [
    '',
    '┌───────────────────────────────────────────────',
    `│ ${statusIcon}  Resumo do Cursor Reviewer`,
    '├───────────────────────────────────────────────',
    `│ Modo:                ${modeLabel}`,
    `│ Agent ID:            ${agentId}`,
    `│ Run ID:              ${runId}`,
    `│ Reviews novos:       ${gate.newReviewsCount}`,
    `│ Threads resolvidas:  ${gate.resolvedCount}`,
    `│ Threads pendentes:   ${gate.pendingThreadCount}`,
    `│ Severidades:         🛑 ${gate.severities.critical}  ⚠️ ${gate.severities.warning}  💡 ${gate.severities.suggestion}`,
  ];

  if (hasEngineMetrics(metrics)) {
    lines.push('├───────────────────────────────────────────────');
    const input = metrics![ENGINE_METRIC_KEYS.inputTokens] ?? 0;
    const output = metrics![ENGINE_METRIC_KEYS.outputTokens] ?? 0;
    const total = metrics![ENGINE_METRIC_KEYS.totalTokens] ?? input + output;
    const cacheRead = metrics![ENGINE_METRIC_KEYS.cacheReadTokens] ?? 0;
    const cacheWrite = metrics![ENGINE_METRIC_KEYS.cacheWriteTokens] ?? 0;

    lines.push(
      `│ Tokens input:        ${formatTokenCount(input)}`,
      `│ Tokens output:       ${formatTokenCount(output)}`,
      `│ Tokens total:        ${formatTokenCount(total)}`,
    );
    if (cacheRead > 0 || cacheWrite > 0) {
      lines.push(
        `│ Cache read:          ${formatTokenCount(cacheRead)}`,
        `│ Cache write:         ${formatTokenCount(cacheWrite)}`,
      );
    }
  } else if (metrics) {
    lines.push('├───────────────────────────────────────────────', '│ Tokens:              (não reportados)');
  }

  lines.push(
    '├───────────────────────────────────────────────',
    `│ Status: ${statusLabel}`,
    `│ Motivo: ${gate.reason}`,
    `│ Pipeline: SUCESSO (exit 0 — issues não bloqueiam)`,
    '└───────────────────────────────────────────────',
  );

  if (gate.pendingThreads.length > 0) {
    lines.push('', 'Threads pendentes:');
    for (const thread of gate.pendingThreads) {
      const location =
        thread.filePath != null
          ? `${thread.filePath}:${thread.lineNumber ?? '?'}`
          : '(thread geral)';
      lines.push(
        `  - #${thread.threadId} [${thread.status}] ${location} | autor: ${thread.author}${thread.botTag ? ` (${thread.botTag})` : ''}`,
      );
      lines.push(`    ${thread.summary}`);
    }
  }

  return lines.join('\n');
}
