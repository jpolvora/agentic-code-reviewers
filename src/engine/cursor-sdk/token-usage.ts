import type { InteractionUpdate } from '@cursor/sdk';

/** Totais de tokens acumulados durante a execução do agente. */
export interface TokenUsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  /** input + output (cache não entra no total principal). */
  totalTokens: number;
  /** Quantidade de eventos `turn-ended` com `usage` recebidos. */
  turnCount: number;
  /** True quando pelo menos um `turn-ended.usage` foi recebido do SDK. */
  hasAuthoritativeUsage: boolean;
}

export const EMPTY_TOKEN_USAGE: TokenUsageTotals = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
  turnCount: 0,
  hasAuthoritativeUsage: false,
};

/**
 * Acumula tokens a partir dos deltas do SDK (`onDelta` em `agent.send()`).
 * Fonte primária: `turn-ended.usage` (input/output/cache por turno do modelo).
 * Fallback: soma de `token-delta` quando `usage` não é emitido.
 */
export class TokenUsageAccumulator {
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheReadTokens = 0;
  private cacheWriteTokens = 0;
  private turnCount = 0;
  private hasAuthoritativeUsage = false;
  private outputTokensFallback = 0;

  reset(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.cacheReadTokens = 0;
    this.cacheWriteTokens = 0;
    this.turnCount = 0;
    this.hasAuthoritativeUsage = false;
    this.outputTokensFallback = 0;
  }

  applyInteractionUpdate(update: InteractionUpdate): void {
    switch (update.type) {
      case 'turn-ended':
        if (update.usage) {
          this.inputTokens += update.usage.inputTokens;
          this.outputTokens += update.usage.outputTokens;
          this.cacheReadTokens += update.usage.cacheReadTokens;
          this.cacheWriteTokens += update.usage.cacheWriteTokens;
          this.turnCount += 1;
          this.hasAuthoritativeUsage = true;
        }
        break;
      case 'token-delta':
        if (!this.hasAuthoritativeUsage) {
          this.outputTokensFallback += update.tokens;
        }
        break;
      default:
        break;
    }
  }

  getTotals(): TokenUsageTotals {
    if (this.hasAuthoritativeUsage) {
      return {
        inputTokens: this.inputTokens,
        outputTokens: this.outputTokens,
        cacheReadTokens: this.cacheReadTokens,
        cacheWriteTokens: this.cacheWriteTokens,
        totalTokens: this.inputTokens + this.outputTokens,
        turnCount: this.turnCount,
        hasAuthoritativeUsage: true,
      };
    }

    const outputTokens = this.outputTokensFallback;
    return {
      inputTokens: 0,
      outputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: outputTokens,
      turnCount: 0,
      hasAuthoritativeUsage: false,
    };
  }
}

export function formatTokenCount(value: number): string {
  return value.toLocaleString('pt-BR');
}

/** Linhas de log para o resumo final de tokens. */
export function formatTokenUsageSummary(usage: TokenUsageTotals): string[] {
  if (!usage.hasAuthoritativeUsage && usage.totalTokens === 0) {
    return ['Tokens: (não reportados pelo SDK nesta execução)'];
  }

  const lines = [
    `Tokens input:  ${formatTokenCount(usage.inputTokens)}`,
    `Tokens output: ${formatTokenCount(usage.outputTokens)}`,
    `Tokens total:  ${formatTokenCount(usage.totalTokens)}`,
  ];

  if (usage.cacheReadTokens > 0 || usage.cacheWriteTokens > 0) {
    lines.push(
      `Cache read:    ${formatTokenCount(usage.cacheReadTokens)}`,
      `Cache write:   ${formatTokenCount(usage.cacheWriteTokens)}`,
    );
  }

  if (usage.turnCount > 1) {
    lines.push(`Turnos modelo: ${usage.turnCount}`);
  }

  if (!usage.hasAuthoritativeUsage && usage.totalTokens > 0) {
    lines.push('(estimativa via token-delta — usage oficial indisponível)');
  }

  return lines;
}
