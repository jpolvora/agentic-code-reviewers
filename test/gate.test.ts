import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateGate } from '../src/ado/gate.js';
import type { CodeReviewItem, PendingPrThread } from '../src/ado/types.js';

const sampleReview: CodeReviewItem = {
  fileName: '/src/Foo.cs',
  lineNumber: 10,
  severity: 'critical',
  comment: 'Issue',
  score: 8,
  developerAction: 'fix-code',
  analysis: 'Análise',
  impactPaths: ['/src/Foo.cs'],
  suggestedFix: 'Corrigir',
};

const samplePending: PendingPrThread = {
  threadId: 1,
  status: 'active',
  author: 'bot',
  botTag: '[Cursor Reviewer]',
  summary: 'Pending issue',
  filePath: '/src/Bar.cs',
  lineNumber: 5,
};

describe('evaluateGate', () => {
  it('marca shouldFail quando há reviews novos, sem alterar exit code da pipeline', () => {
    const gate = evaluateGate({
      newReviews: [sampleReview],
      resolvedCount: 0,
      pendingThreads: [],
    });

    assert.equal(gate.shouldFail, true);
    assert.match(gate.reason, /1 nova\(s\) thread/);
  });

  it('marca shouldFail quando há threads pendentes', () => {
    const gate = evaluateGate({
      newReviews: [],
      resolvedCount: 0,
      pendingThreads: [samplePending],
    });

    assert.equal(gate.shouldFail, true);
    assert.match(gate.reason, /1 thread\(s\) ativa/);
  });

  it('retorna shouldFail false quando não há issues abertas', () => {
    const gate = evaluateGate({
      newReviews: [],
      resolvedCount: 2,
      pendingThreads: [],
    });

    assert.equal(gate.shouldFail, false);
    assert.match(gate.reason, /Nenhuma issue nova/);
  });
});
