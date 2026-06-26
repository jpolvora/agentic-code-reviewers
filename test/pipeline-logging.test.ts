import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildReviewSummaryMarkdown,
  formatLogIssueCommand,
} from '../src/ado/pipeline-logging.js';
import { formatCommentForPosting } from '../src/ado/format-thread.js';
import type { CodeReviewItem, GateEvaluation } from '../src/ado/types.js';

function review(overrides: Partial<CodeReviewItem> = {}): CodeReviewItem {
  return {
    fileName: '/src/Foo.cs',
    lineNumber: 42,
    severity: 'warning',
    comment: 'Possível NRE quando input é nulo.',
    score: 7,
    developerAction: 'fix-code',
    analysis: 'Evidência lida.',
    impactPaths: ['/src/Foo.cs'],
    ...overrides,
  };
}

const gate: GateEvaluation = {
  shouldFail: true,
  reason: 'teste',
  newReviewsCount: 1,
  resolvedCount: 0,
  pendingThreadCount: 0,
  pendingThreads: [],
  severities: { critical: 1, warning: 0, suggestion: 0 },
};

describe('formatLogIssueCommand', () => {
  it('usa type=error para critical e remove a barra inicial do sourcepath', () => {
    const cmd = formatLogIssueCommand(review({ severity: 'critical' }));
    assert.match(cmd, /^##vso\[task\.logissue /);
    assert.match(cmd, /type=error/);
    assert.match(cmd, /sourcepath=src\/Foo\.cs/);
    assert.match(cmd, /linenumber=42/);
    assert.match(cmd, /score 7\/10/);
  });

  it('usa type=warning para warning e suggestion', () => {
    assert.match(formatLogIssueCommand(review({ severity: 'warning' })), /type=warning/);
    assert.match(formatLogIssueCommand(review({ severity: 'suggestion' })), /type=warning/);
  });

  it('colapsa a mensagem em uma única linha', () => {
    const cmd = formatLogIssueCommand(review({ comment: 'linha 1\nlinha 2' }));
    assert.equal(cmd.includes('\n'), false);
  });
});

describe('buildReviewSummaryMarkdown', () => {
  it('inclui status, severidades e linha de tabela por review', () => {
    const md = buildReviewSummaryMarkdown(gate, [review()], false);
    assert.match(md, /# Cursor Reviewer/);
    assert.match(md, /Com issues/);
    assert.match(md, /\| warning \| 7 \| `src\/Foo\.cs:42`/);
  });
});

describe('formatCommentForPosting — fences', () => {
  it('normaliza ```suggestion para bloco neutro e usa label de correção', () => {
    const body = formatCommentForPosting(
      review({ suggestedFix: '```suggestion\nvar x = 1;\n```' }),
      '[Cursor Reviewer]',
    );
    assert.equal(body.includes('```suggestion'), false);
    assert.match(body, /\*\*Correção sugerida:\*\*/);
    assert.match(body, /```\nvar x = 1;\n```/);
  });

  it('envolve sugestão sem fence em bloco de código neutro', () => {
    const body = formatCommentForPosting(
      review({ suggestedFix: 'troque == por ===' }),
      '[Cursor Reviewer]',
    );
    assert.match(body, /\*\*Correção sugerida:\*\*\n\n```\ntroque == por ===\n```/);
  });
});
