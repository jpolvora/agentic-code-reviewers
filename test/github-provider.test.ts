import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterValidResolvedItems,
  getNewReviewsFromPlan,
  isDuplicateReview,
  isActiveOrPendingStatus,
  matchesResolvedItem,
} from '../src/ado/post-comments.js';
import { reviewDedupKey } from '../src/ado/utils.js';
import {
  commentBodyHasResolutionReply,
  LEGACY_RESOLUTION_MARKER,
  RESOLUTION_MARKER,
} from '../src/git/markers.js';
import type { ActiveThreadInfo, CodeReviewItem, ResolvedThreadItem } from '../src/ado/types.js';
import { ROUND_STATE_MARKER } from '../src/ado/round-state.js';
import { GithubProvider } from '../src/provider/github.js';
import { buildBotTag } from '../src/bot-tag.js';

const BOT = buildBotTag('cursor-sdk');

function validReview(overrides: Partial<CodeReviewItem> = {}): CodeReviewItem {
  return {
    fileName: '/src/Foo.cs',
    lineNumber: 42,
    severity: 'critical',
    comment: 'Objective problem',
    score: 10,
    developerAction: 'fix-code',
    analysis: 'Evidence verified in the code.',
    impactPaths: ['/src/Foo.cs'],
    suggestedFix: '```csharp\n// fix\n```',
    ...overrides,
  };
}

function activeThread(overrides: Partial<ActiveThreadInfo> = {}): ActiveThreadInfo {
  return {
    threadId: 'thread-1',
    filePath: '/src/auth/service.ts',
    lineNumber: 42,
    status: 'active',
    summary: 'issue',
    description: 'issue description',
    botCommentId: 100,
    hasResolutionReply: false,
    ...overrides,
  };
}

describe('GitHub parity — dedup de paths', () => {
  it('existingKeys normalizadas deduplicam review com barra inicial e case diferente', () => {
    const existingKeys = new Map<string, boolean>();
    existingKeys.set(reviewDedupKey('src/auth/service.ts', 42), true);

    const review = validReview({
      fileName: '/src/Auth/Service.ts',
      lineNumber: 42,
    });

    assert.equal(isDuplicateReview(review, existingKeys), true);
    assert.equal(getNewReviewsFromPlan(JSON.stringify({ reviews: [review] }), existingKeys).length, 0);
  });

  it('paths com barras invertidas casam com chaves normalizadas', () => {
    const existingKeys = new Map<string, boolean>();
    existingKeys.set(reviewDedupKey('/src/Foo/AppService.cs', 42), true);

    const review = validReview({
      fileName: 'src\\Foo\\AppService.cs',
      lineNumber: 42,
    });

    assert.equal(isDuplicateReview(review, existingKeys), true);
  });
});

describe('GitHub parity — resolução de threads', () => {
  it('matchesResolvedItem normaliza fileName do agente contra thread GitHub', () => {
    const thread = activeThread({ filePath: '/src/auth/service.ts', lineNumber: 42 });
    const item: ResolvedThreadItem = {
      fileName: 'src/auth/service.ts',
      lineNumber: 42,
      note: 'corrigido',
    };

    assert.equal(matchesResolvedItem(thread, item), true);
  });

  it('filterValidResolvedItems descarta entradas sem threadId ou file+line', () => {
    const filtered = filterValidResolvedItems([
      { note: 'invalid' },
      { fileName: '/src/a.ts', lineNumber: 1, note: 'ok' },
      { threadId: 99, note: 'ok' },
    ]);

    assert.equal(filtered.length, 2);
  });

  it('isActiveOrPendingStatus reconhece active e pending', () => {
    assert.equal(isActiveOrPendingStatus('active'), true);
    assert.equal(isActiveOrPendingStatus('pending'), true);
    assert.equal(isActiveOrPendingStatus('fixed'), false);
  });
});

describe('GitHub parity — hasResolutionReply não ativado pelo comentário raiz', () => {
  it('não marca hasResolutionReply quando só o comentário raiz contém o marcador', () => {
    // O primeiro comentário (databaseId === 100) é o review do bot.
    // Se analysis/suggestedFix menciona o marcador, NÃO deve ser tratado como reply.
    const firstDbId = 100;
    const reviewBody = [
      BOT,
      '⚠️ **WARNING:** threadHasResolutionReply pode auto-resolver.',
      `Veja ${RESOLUTION_MARKER} no código`,
    ].join('\n');

    // Simula o trecho de github.ts: comments.some(c => c.databaseId !== firstComment.databaseId && ...)
    const comments = [{ databaseId: firstDbId, body: reviewBody }];
    const firstComment = comments[0];
    const hasReply = comments.some(
      (c) =>
        c.databaseId !== firstComment.databaseId &&
        c.body.includes(BOT) &&
        commentBodyHasResolutionReply(c.body, BOT),
    );
    assert.equal(hasReply, false);
  });

  it('marca hasResolutionReply quando reply (id diferente) contém o marcador', () => {
    const firstDbId = 100;
    const reviewBody = `${BOT}\n⚠️ **WARNING:** issue real`;
    const replyBody = `${BOT}\n${RESOLUTION_MARKER}\ncorrigido`;

    const comments = [
      { databaseId: firstDbId, body: reviewBody },
      { databaseId: 101, body: replyBody },
    ];
    const firstComment = comments[0];
    const hasReply = comments.some(
      (c) =>
        c.databaseId !== firstComment.databaseId &&
        c.body.includes(BOT) &&
        commentBodyHasResolutionReply(c.body, BOT),
    );
    assert.equal(hasReply, true);
  });
});

describe('GitHub parity — marcadores de resolução', () => {
  it('detecta marcador canônico ADO', () => {
    assert.equal(
      commentBodyHasResolutionReply(`${BOT}\n${RESOLUTION_MARKER}\nfixed`, BOT),
      true,
    );
  });

  it('detecta marcador legado GitHub', () => {
    assert.equal(
      commentBodyHasResolutionReply(`${BOT}\n${LEGACY_RESOLUTION_MARKER}\nfixed`, BOT),
      true,
    );
  });

  it('detecta reply histórico com Addressing issue', () => {
    assert.equal(
      commentBodyHasResolutionReply(`${BOT}\nAddressing issue in this PR`, BOT),
      true,
    );
  });

  it('ignora comentário sem marcador de resolução', () => {
    assert.equal(commentBodyHasResolutionReply(`${BOT}\n⚠️ **WARNING:** bug`, BOT), false);
  });
});

describe('GithubProvider — parseRoundStateFromThreads', () => {
  it('retorna round 0 quando não há thread de estado', () => {
    const provider = new GithubProvider();
    assert.deepEqual(provider.parseRoundStateFromThreads(null, BOT), {
      round: 0,
      threadId: null,
      commentId: null,
    });

    const threads = {
      value: [
        {
          id: '1',
          comments: [{ id: 9, content: `${BOT}\nissue`, isDeleted: false }],
        },
      ],
    };
    assert.equal(provider.parseRoundStateFromThreads(threads, BOT).round, 0);
  });

  it('extrai round, threadId e commentId do marcador na thread geral do bot', () => {
    const provider = new GithubProvider();
    const threads = {
      value: [
        {
          id: '42',
          comments: [
            {
              id: 7,
              content: `${BOT}\n${ROUND_STATE_MARKER}\n\n**Automatic review state** — Round: 2 / 3`,
              isDeleted: false,
            },
          ],
        },
      ],
    };

    assert.deepEqual(provider.parseRoundStateFromThreads(threads, BOT), {
      round: 2,
      threadId: '42',
      commentId: 7,
    });
  });

  it('parses legacy Rodada-format round-state threads', () => {
    const provider = new GithubProvider();
    const threads = {
      value: [
        {
          id: '99',
          comments: [
            {
              id: 1,
              content: `${BOT}\n${ROUND_STATE_MARKER}\n\n**Estado da revisão automática** — Rodada: 5 / 10`,
              isDeleted: false,
            },
          ],
        },
      ],
    };
    assert.equal(provider.parseRoundStateFromThreads(threads, BOT).round, 5);
  });
});
