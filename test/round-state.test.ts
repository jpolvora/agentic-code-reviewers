import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ROUND_STATE_MARKER,
  buildRoundStateComment,
  decideRoundEscalation,
  parseRoundStateFromThreads,
  splitReviewsForEscalation,
} from '../src/ado/round-state.js';
import type { AdoThreadsResponse, CodeReviewItem } from '../src/ado/types.js';

const BOT = '[Cursor Reviewer]';

function review(overrides: Partial<CodeReviewItem> = {}): CodeReviewItem {
  return {
    fileName: '/src/Foo.cs',
    lineNumber: 10,
    severity: 'warning',
    comment: 'x',
    score: 7,
    developerAction: 'fix-code',
    analysis: 'a',
    impactPaths: ['/src/Foo.cs'],
    ...overrides,
  };
}

describe('parseRoundStateFromThreads', () => {
  it('retorna round 0 quando não há thread de estado', () => {
    assert.deepEqual(parseRoundStateFromThreads(null, BOT), {
      round: 0,
      threadId: null,
      commentId: null,
    });

    const threads: AdoThreadsResponse = {
      value: [
        {
          id: 1,
          status: 'active',
          threadContext: { filePath: '/src/Foo.cs', rightFileStart: { line: 1 } },
          comments: [{ id: 9, parentCommentId: 0, content: `${BOT}\nissue`, commentType: 1 }],
        },
      ],
    };
    assert.equal(parseRoundStateFromThreads(threads, BOT).round, 0);
  });

  it('extrai round, threadId e commentId do marcador na thread geral do bot', () => {
    const threads: AdoThreadsResponse = {
      value: [
        {
          id: 42,
          status: 'closed',
          comments: [
            {
              id: 7,
              parentCommentId: 0,
              content: `${BOT}\n${ROUND_STATE_MARKER}\n\n**Estado da revisão automática** — Rodada: 2 / 3`,
              commentType: 1,
            },
          ],
        },
      ],
    };

    assert.deepEqual(parseRoundStateFromThreads(threads, BOT), {
      round: 2,
      threadId: 42,
      commentId: 7,
    });
  });
});

describe('decideRoundEscalation', () => {
  it('não escala quando maxRounds = 0 (desabilitado)', () => {
    assert.equal(
      decideRoundEscalation({ currentRound: 99, maxRounds: 0, hasOpenIssues: true }),
      false,
    );
  });

  it('não escala dentro do orçamento', () => {
    assert.equal(decideRoundEscalation({ currentRound: 3, maxRounds: 3, hasOpenIssues: true }), false);
  });

  it('escala quando excede o orçamento e há issues abertas', () => {
    assert.equal(decideRoundEscalation({ currentRound: 4, maxRounds: 3, hasOpenIssues: true }), true);
  });

  it('não escala quando excede o orçamento mas não há issues', () => {
    assert.equal(decideRoundEscalation({ currentRound: 4, maxRounds: 3, hasOpenIssues: false }), false);
  });
});

describe('splitReviewsForEscalation', () => {
  it('mantém apenas critical e separa os não-críticos', () => {
    const reviews = [
      review({ severity: 'critical' }),
      review({ severity: 'warning' }),
      review({ severity: 'suggestion' }),
    ];
    const { kept, suppressed } = splitReviewsForEscalation(reviews);
    assert.equal(kept.length, 1);
    assert.equal(kept[0].severity, 'critical');
    assert.equal(suppressed.length, 2);
  });
});

describe('buildRoundStateComment', () => {
  it('inclui marcador e número da rodada sem escalonamento', () => {
    const content = buildRoundStateComment(BOT, {
      currentRound: 2,
      maxRounds: 3,
      escalate: false,
      suppressedCount: 0,
    });
    assert.ok(content.includes(ROUND_STATE_MARKER));
    assert.ok(content.includes('Rodada: 2 / 3'));
    assert.ok(!content.includes('revisão humana'));
  });

  it('inclui aviso de escalonamento e contagem suprimida', () => {
    const content = buildRoundStateComment(BOT, {
      currentRound: 4,
      maxRounds: 3,
      escalate: true,
      suppressedCount: 2,
    });
    assert.ok(content.includes('revisão automática pausada'));
    assert.ok(content.includes('2 apontamento(s) não-crítico(s)'));
    assert.ok(content.includes('revisão humana'));
  });
});
