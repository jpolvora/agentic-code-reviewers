import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkSafeReview,
  filterSafeOutputs,
  type SafeOutputOptions,
} from '../src/ado/safe-outputs.js';
import type { CodeReviewItem } from '../src/ado/types.js';
import { parseChangedLinesFromDiff } from '../src/git/diff-lines.js';

const VALID_ANALYSIS =
  '1. Evidência: li Foo.cs. 2. Cenário: falha ao salvar. 3. Proteção: sem testes. 4. Descarte: nits de estilo.';

function validReview(overrides: Partial<CodeReviewItem> = {}): CodeReviewItem {
  return {
    fileName: '/src/Foo.cs',
    lineNumber: 11,
    severity: 'critical',
    comment: 'Problema objetivo',
    score: 9,
    developerAction: 'fix-code',
    analysis: VALID_ANALYSIS,
    impactPaths: ['/src/Foo.cs'],
    ...overrides,
  };
}

const SAMPLE_DIFF = `diff --git a/src/Foo.cs b/src/Foo.cs
--- a/src/Foo.cs
+++ b/src/Foo.cs
@@ -10,3 +10,4 @@
 line
+added
`;

function baseOptions(overrides: Partial<SafeOutputOptions> = {}): SafeOutputOptions {
  return {
    enabled: true,
    requireDiffLine: true,
    maxCommentChars: 8000,
    protectedPatterns: ['.github/workflows/**'],
    changedLines: parseChangedLinesFromDiff(SAMPLE_DIFF),
    scoreMin: 6,
    ...overrides,
  };
}

describe('checkSafeReview', () => {
  it('accepts valid review on changed line', () => {
    assert.equal(checkSafeReview(validReview(), baseOptions()).safe, true);
  });

  it('rejects line not in diff', () => {
    const result = checkSafeReview(validReview({ lineNumber: 99 }), baseOptions());
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'diff-line');
  });

  it('rejects severity/score mismatch', () => {
    const result = checkSafeReview(validReview({ severity: 'warning', score: 9 }), baseOptions());
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'severity-score');
  });

  it('aceita warning com score abaixo de 6 quando scoreMin customizado é 4', () => {
    const result = checkSafeReview(
      validReview({ severity: 'warning', score: 5 }),
      baseOptions({ scoreMin: 4, requireDiffLine: false }),
    );
    assert.equal(result.safe, true);
  });

  it('rejeita warning abaixo do scoreMin customizado', () => {
    const result = checkSafeReview(
      validReview({ severity: 'warning', score: 3 }),
      baseOptions({ scoreMin: 4, requireDiffLine: false }),
    );
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'severity-score');
  });

  it('rejects missing analysis structure', () => {
    const result = checkSafeReview(validReview({ analysis: 'texto livre' }), baseOptions());
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'analysis-structure');
  });

  it('accepts analysis with bold section labels (markdown from LLM)', () => {
    const boldAnalysis =
      '1. **Evidência:** li Foo.cs. 2. **Cenário:** falha. 3. **Proteção:** sem testes. 4. **Descarte:** nits.';
    const result = checkSafeReview(validReview({ analysis: boldAnalysis }), baseOptions());
    assert.equal(result.safe, true);
  });

  it('rejects protected path in fileName', () => {
    const result = checkSafeReview(
      validReview({ fileName: '.github/workflows/ci.yml', lineNumber: 1 }),
      baseOptions({ requireDiffLine: false }),
    );
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'protected-path');
  });

  it('rejects secret-like patterns', () => {
    const result = checkSafeReview(
      validReview({ comment: 'key is ghp_abcdefghijklmnopqrstuvwxyz1234567890' }),
      baseOptions(),
    );
    assert.equal(result.safe, false);
    assert.equal(result.reason, 'secret-pattern');
  });

  it('skips checks when disabled', () => {
    assert.equal(checkSafeReview(validReview({ lineNumber: 1, analysis: 'x' }), baseOptions({ enabled: false })).safe, true);
  });
});

describe('filterSafeOutputs', () => {
  it('filters unsafe reviews with warning', () => {
    const filtered = filterSafeOutputs(
      [validReview(), validReview({ lineNumber: 50 })],
      baseOptions(),
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]!.lineNumber, 11);
  });
});
