import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterPublishableReviews,
  isPublishableReview,
  MIN_PUBLISHABLE_SCORE,
} from '../src/ado/review-validation.js';
import type { CodeReviewItem } from '../src/ado/types.js';

function validReview(overrides: Partial<CodeReviewItem> = {}): CodeReviewItem {
  return {
    fileName: '/src/Foo.cs',
    lineNumber: 42,
    severity: 'critical',
    comment: 'Problema objetivo',
    score: 8,
    developerAction: 'fix-code',
    analysis: 'Evidência: li Foo.cs. Cenário reproduzível.',
    impactPaths: ['/src/Foo.cs'],
    suggestedFix: 'Sugestão:\n\n```suggestion\n// fix\n```',
    ...overrides,
  };
}

describe('isPublishableReview', () => {
  it('aceita review completo com score mínimo publicável', () => {
    assert.equal(isPublishableReview(validReview({ score: MIN_PUBLISHABLE_SCORE })), true);
  });

  it('rejeita score ausente, abaixo do mínimo ou fora do intervalo', () => {
    assert.equal(isPublishableReview(validReview({ score: undefined })), false);
    assert.equal(isPublishableReview(validReview({ score: 5 })), false);
    assert.equal(isPublishableReview(validReview({ score: 11 })), false);
  });

  it('aceita score >= scoreMin customizado', () => {
    assert.equal(isPublishableReview(validReview({ score: 4 }), 4), true);
    assert.equal(isPublishableReview(validReview({ score: 3 }), 4), false);
  });

  it('rejeita campos obrigatórios ausentes', () => {
    assert.equal(isPublishableReview(validReview({ fileName: '' })), false);
    assert.equal(isPublishableReview(validReview({ lineNumber: 0 })), false);
    assert.equal(isPublishableReview(validReview({ comment: '' })), false);
    assert.equal(isPublishableReview(validReview({ analysis: '' })), false);
    assert.equal(isPublishableReview(validReview({ impactPaths: [] })), false);
    assert.equal(isPublishableReview(validReview({ developerAction: undefined })), false);
  });

  it('aceita suggestedFix vazio ou ausente', () => {
    assert.equal(isPublishableReview(validReview({ suggestedFix: '' })), true);
    assert.equal(isPublishableReview(validReview({ suggestedFix: undefined })), true);
  });

  it('rejeita developerAction resolve-comment mesmo com score alto', () => {
    assert.equal(isPublishableReview(validReview({ developerAction: 'resolve-comment' })), false);
  });
});

describe('filterPublishableReviews', () => {
  it('mantém apenas reviews válidos', () => {
    const filtered = filterPublishableReviews([
      validReview(),
      validReview({ score: 3, fileName: '/src/Low.cs' }),
      validReview({ fileName: '/src/Other.cs', lineNumber: 10 }),
    ]);

    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].fileName, '/src/Foo.cs');
    assert.equal(filtered[1].fileName, '/src/Other.cs');
  });

  it('respeita scoreMin customizado', () => {
    const filtered = filterPublishableReviews(
      [validReview({ score: 4 }), validReview({ score: 3, fileName: '/src/Low.cs' })],
      4,
    );
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].score, 4);
  });
});
