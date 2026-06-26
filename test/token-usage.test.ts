import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  EMPTY_TOKEN_USAGE,
  formatTokenUsageSummary,
  TokenUsageAccumulator,
} from '../src/engine/cursor-sdk/token-usage.js';

describe('TokenUsageAccumulator', () => {
  it('inicia zerado após reset', () => {
    const acc = new TokenUsageAccumulator();
    acc.applyInteractionUpdate({ type: 'turn-ended', usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 } });
    acc.reset();
    const totals = acc.getTotals();
    assert.deepEqual(totals, EMPTY_TOKEN_USAGE);
  });

  it('soma usage de múltiplos turn-ended (input/output separados)', () => {
    const acc = new TokenUsageAccumulator();
    acc.applyInteractionUpdate({
      type: 'turn-ended',
      usage: { inputTokens: 10_000, outputTokens: 2_000, cacheReadTokens: 500, cacheWriteTokens: 100 },
    });
    acc.applyInteractionUpdate({
      type: 'turn-ended',
      usage: { inputTokens: 5_000, outputTokens: 1_500, cacheReadTokens: 200, cacheWriteTokens: 0 },
    });

    const totals = acc.getTotals();
    assert.equal(totals.inputTokens, 15_000);
    assert.equal(totals.outputTokens, 3_500);
    assert.equal(totals.totalTokens, 18_500);
    assert.equal(totals.cacheReadTokens, 700);
    assert.equal(totals.cacheWriteTokens, 100);
    assert.equal(totals.turnCount, 2);
    assert.equal(totals.hasAuthoritativeUsage, true);
  });

  it('ignora token-delta após receber turn-ended com usage', () => {
    const acc = new TokenUsageAccumulator();
    acc.applyInteractionUpdate({
      type: 'turn-ended',
      usage: { inputTokens: 1_000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
    });
    acc.applyInteractionUpdate({ type: 'token-delta', tokens: 9_999 });

    const totals = acc.getTotals();
    assert.equal(totals.outputTokens, 200);
    assert.equal(totals.totalTokens, 1_200);
  });

  it('usa token-delta como fallback quando não há turn-ended.usage', () => {
    const acc = new TokenUsageAccumulator();
    acc.applyInteractionUpdate({ type: 'token-delta', tokens: 42 });
    acc.applyInteractionUpdate({ type: 'token-delta', tokens: 58 });

    const totals = acc.getTotals();
    assert.equal(totals.inputTokens, 0);
    assert.equal(totals.outputTokens, 100);
    assert.equal(totals.totalTokens, 100);
    assert.equal(totals.hasAuthoritativeUsage, false);
  });
});

describe('formatTokenUsageSummary', () => {
  it('formata linhas com input, output e total', () => {
    const lines = formatTokenUsageSummary({
      inputTokens: 1200,
      outputTokens: 340,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 1540,
      turnCount: 1,
      hasAuthoritativeUsage: true,
    });
    assert.match(lines.join('\n'), /Tokens input:/);
    assert.match(lines.join('\n'), /Tokens output:/);
    assert.match(lines.join('\n'), /Tokens total:/);
  });

  it('indica quando tokens não foram reportados', () => {
    const lines = formatTokenUsageSummary(EMPTY_TOKEN_USAGE);
    assert.match(lines[0], /não reportados/);
  });
});
