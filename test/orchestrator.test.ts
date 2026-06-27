import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { chunkFilesByCount } from '../src/orchestrator/chunk-diff.js';
import { mergeReviews } from '../src/orchestrator/merge-reviews.js';
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
});
