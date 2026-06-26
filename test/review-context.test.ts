import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getCodeReviewPostingPlan, getNewReviewsFromPlan, parseCodeReviewResponse } from '../src/ado/post-comments.js';
import { getPullRequestReviewContext } from '../src/ado/review-context.js';
import type { CodeReviewItem } from '../src/ado/types.js';

function validReview(overrides: Partial<CodeReviewItem> = {}): CodeReviewItem {
  return {
    fileName: '/src/Foo.cs',
    lineNumber: 42,
    severity: 'critical',
    comment: 'Problema objetivo',
    score: 10,
    developerAction: 'fix-code',
    analysis: 'Evidência verificada no código.',
    impactPaths: ['/src/Foo.cs'],
    suggestedFix: '```csharp\n// fix\n```',
    ...overrides,
  };
}

describe('getPullRequestReviewContext', () => {
  it('não deduplica novas reviews contra threads já resolvidas', async () => {
    const fakeClient = {
      get: async () => ({
        value: [
          {
            id: 10,
            status: 'fixed',
            threadContext: {
              filePath: '/src/Foo.cs',
              rightFileStart: { line: 42 },
            },
            comments: [
              {
                id: 1,
                parentCommentId: 0,
                content: '[Cursor Reviewer]\nold issue',
                commentType: 1,
              },
            ],
          },
        ],
      }),
    };

    const context = await getPullRequestReviewContext(
      fakeClient as never,
      123,
      '[Cursor Reviewer]',
      () => {},
    );

    const reviewsJson = JSON.stringify({
      reviews: [validReview({ comment: 'bug reintroduced' })],
    });

    assert.equal(context.existingKeys.size, 0);
    assert.equal(getNewReviewsFromPlan(reviewsJson, context.existingKeys).length, 1);
  });

  it('deduplica reviews com barras invertidas contra paths normalizados do ADO', async () => {
    const fakeClient = {
      get: async () => ({
        value: [
          {
            id: 11,
            status: 'active',
            threadContext: {
              filePath: '/src/Foo/AppService.cs',
              rightFileStart: { line: 42 },
            },
            comments: [
              {
                id: 1,
                parentCommentId: 0,
                content: '[Cursor Reviewer]\nactive issue',
                commentType: 1,
              },
            ],
          },
        ],
      }),
    };

    const context = await getPullRequestReviewContext(
      fakeClient as never,
      123,
      '[Cursor Reviewer]',
      () => {},
    );

    const reviewsJson = JSON.stringify({
      reviews: [
        validReview({
          fileName: 'src\\Foo\\AppService.cs',
          comment: 'duplicate issue',
        }),
      ],
    });

    assert.equal(getNewReviewsFromPlan(reviewsJson, context.existingKeys).length, 0);
  });

  it('remove reviews com score baixo antes da publicação e do gate', () => {
    const parsed = parseCodeReviewResponse({
      reviews: [
        validReview({
          fileName: '/src/Low.cs',
          lineNumber: 10,
          severity: 'warning',
          comment: 'low score',
          score: 5,
        }),
        validReview({
          fileName: '/src/High.cs',
          lineNumber: 20,
          severity: 'critical',
          comment: 'high score',
          score: 8,
        }),
      ],
      resolvedThreads: [],
      reviewSummary: '',
    });

    const plan = getCodeReviewPostingPlan(parsed, false);
    const reviews = getNewReviewsFromPlan(plan.reviewsJson, new Map());

    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].fileName, '/src/High.cs');
  });

  it('deduplica ocorrências similares intra-lote em parseCodeReviewResponse', () => {
    const parsed = parseCodeReviewResponse({
      reviews: [
        validReview({
          fileName: '/src/Main.cs',
          lineNumber: 10,
          comment: 'Main problem',
          relatedOccurrences: [
            { fileName: '/src/Main.cs', lineNumber: 10 },
            { fileName: '/src/Other.cs', lineNumber: 20 },
            { fileName: '/src/Other.cs', lineNumber: 20 },
          ],
        }),
      ],
      resolvedThreads: [],
      reviewSummary: '',
    });

    assert.equal(parsed.reviews.length, 2);
    assert.equal(parsed.reviews[0].fileName, '/src/Main.cs');
    assert.equal(parsed.reviews[0].lineNumber, 10);
    assert.equal(parsed.reviews[1].fileName, '/src/Other.cs');
    assert.equal(parsed.reviews[1].lineNumber, 20);
  });

  it('não marca hasResolutionReply quando comentário raiz (parentCommentId=0) contém o marcador', async () => {
    const fakeClient = {
      get: async () => ({
        value: [
          {
            id: 20,
            status: 'active',
            threadContext: {
              filePath: '/src/Auth.cs',
              rightFileStart: { line: 15 },
            },
            comments: [
              {
                id: 1,
                parentCommentId: 0,
                content:
                  '[Cursor Reviewer]\n⚠️ **WARNING:** análise menciona <!-- resolution-reply --> como exemplo.',
                commentType: 1,
              },
            ],
          },
        ],
      }),
    };

    const context = await getPullRequestReviewContext(
      fakeClient as never,
      123,
      '[Cursor Reviewer]',
      () => {},
    );

    assert.equal(context.activeThreads.length, 1);
    assert.equal(context.activeThreads[0].hasResolutionReply, false);
  });

  it('marca hasResolutionReply quando reply real (parentCommentId!=0) contém o marcador', async () => {
    const fakeClient = {
      get: async () => ({
        value: [
          {
            id: 21,
            status: 'active',
            threadContext: {
              filePath: '/src/Auth.cs',
              rightFileStart: { line: 15 },
            },
            comments: [
              {
                id: 1,
                parentCommentId: 0,
                content: '[Cursor Reviewer]\n⚠️ **WARNING:** bug real aqui.',
                commentType: 1,
              },
              {
                id: 2,
                parentCommentId: 1,
                content: '[Cursor Reviewer]\n<!-- resolution-reply -->\ncorrigido',
                commentType: 1,
              },
            ],
          },
        ],
      }),
    };

    const context = await getPullRequestReviewContext(
      fakeClient as never,
      123,
      '[Cursor Reviewer]',
      () => {},
    );

    assert.equal(context.activeThreads.length, 1);
    assert.equal(context.activeThreads[0].hasResolutionReply, true);
  });

  it('preserva sumários completos com pontos no padrão de risco', async () => {
    const fakeClient = {
      get: async () => ({
        value: [
          {
            id: 12,
            status: 'active',
            threadContext: {
              filePath: '/src/Main.cs',
              rightFileStart: { line: 10 },
            },
            comments: [
              {
                id: 1,
                parentCommentId: 0,
                content: '[Cursor Reviewer]\nErro com abreviação ex.: HTTP/REST e arquivo config.json.',
                commentType: 1,
              },
            ],
          },
        ],
      }),
    };

    const context = await getPullRequestReviewContext(
      fakeClient as never,
      123,
      '[Cursor Reviewer]',
      () => {},
    );

    assert.ok(context.contextForLlm.includes('- Erro com abreviação ex.: HTTP/REST e arquivo config.json.'));
  });
});
