import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkFilesByCount } from '../src/orchestrator/chunk-diff.js';
import { mergeReviews, mergeCodeReviewResponses } from '../src/orchestrator/merge-reviews.js';
import type { CodeReviewItem } from '../src/ado/types.js';

describe('chunkFilesByCount', () => {
  it('returns single chunk when count is 1', () => {
    const chunks = chunkFilesByCount(['a.ts', 'b.ts'], 1);
    assert.equal(chunks.length, 1);
    assert.deepEqual(chunks[0], ['a.ts', 'b.ts']);
  });

  it('distributes files across chunks', () => {
    const chunks = chunkFilesByCount(['a', 'b', 'c', 'd'], 2);
    assert.equal(chunks.length, 2);
    assert.equal(chunks[0]!.length, 2);
    assert.equal(chunks[1]!.length, 2);
  });
});

describe('mergeReviews', () => {
  it('deduplicates by file and line keeping higher score', () => {
    const a: CodeReviewItem = {
      fileName: '/src/A.cs',
      lineNumber: 10,
      severity: 'warning',
      comment: 'issue A',
      score: 7,
      developerAction: 'fix-code',
      analysis: '1. Evidência: x. 2. Cenário: y. 3. Proteção: z. 4. Descarte: w.',
      impactPaths: ['/src/A.cs'],
    };
    const b = { ...a, score: 8, comment: 'issue A duplicate' };
    const merged = mergeReviews([[a], [b]]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.score, 8);
  });

  it('mergeCodeReviewResponses preserva reviewSummary quando múltiplos chunks retornam sem reviews', () => {
    const result = mergeCodeReviewResponses([
      { reviews: [], reviewSummary: 'Chunk 1: nenhum problema.' },
      { reviews: [], reviewSummary: 'Chunk 2: código limpo.' },
    ]);
    assert.equal(result.reviews.length, 0);
    assert.ok(result.reviewSummary.includes('Chunk 1'));
    assert.ok(result.reviewSummary.includes('Chunk 2'));
  });

  it('mergeCodeReviewResponses usa summary único quando há apenas um chunk', () => {
    const result = mergeCodeReviewResponses([
      { reviews: [], reviewSummary: 'Tudo certo.' },
    ]);
    assert.equal(result.reviewSummary, 'Tudo certo.');
  });

  it('preserves non-critical reviews when merging with filtered critical subset', () => {
    const critical: CodeReviewItem = {
      fileName: '/src/A.cs',
      lineNumber: 10,
      severity: 'critical',
      comment: 'critical issue',
      score: 9,
      developerAction: 'fix-code',
      analysis: '1. Evidência: x. 2. Cenário: y. 3. Proteção: z. 4. Descarte: w.',
      impactPaths: ['/src/A.cs'],
    };
    const warning: CodeReviewItem = {
      fileName: '/src/B.cs',
      lineNumber: 20,
      severity: 'warning',
      comment: 'warning issue',
      score: 7,
      developerAction: 'fix-code',
      analysis: '1. Evidência: x. 2. Cenário: y. 3. Proteção: z. 4. Descarte: w.',
      impactPaths: ['/src/B.cs'],
    };
    const filtered = [critical];
    const nonCritical = [warning];
    const merged = mergeReviews([nonCritical, filtered]);
    assert.equal(merged.length, 2);
    assert.deepEqual(
      merged.map((r) => r.fileName).sort(),
      ['/src/A.cs', '/src/B.cs'],
    );
  });
});
