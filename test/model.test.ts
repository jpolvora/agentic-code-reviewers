import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertSupportedCursorReviewerModelId,
  CANONICAL_COMPOSER_25_MODEL_ID,
  CursorReviewerModelId,
  DEFAULT_CURSOR_REVIEWER_MODEL,
  isSupportedCursorReviewerModelId,
  listSupportedCursorReviewerModelIds,
  resolveAgentModelSelection,
} from '../src/engine/cursor-sdk/model.js';

describe('CursorReviewerModelId', () => {
  it('usa composer-2.5 como default canônico', () => {
    assert.equal(CANONICAL_COMPOSER_25_MODEL_ID, 'composer-2.5');
    assert.equal(DEFAULT_CURSOR_REVIEWER_MODEL, CursorReviewerModelId.Composer25);
  });

  it('lista todos os IDs suportados', () => {
    assert.equal(listSupportedCursorReviewerModelIds().length, Object.values(CursorReviewerModelId).length);
    assert.ok(isSupportedCursorReviewerModelId('gpt-5.4'));
    assert.ok(!isSupportedCursorReviewerModelId('gpt-5.4-medium'));
  });

  it('rejeita modelo desconhecido na validação', () => {
    assert.throws(
      () => assertSupportedCursorReviewerModelId('$(CURSOR_REVIEWER_MODEL)'),
      /Modelo inválido/,
    );
    assert.throws(() => assertSupportedCursorReviewerModelId('gpt-5.4-medium'), /Modelo inválido/);
  });

  it('aceita todos os valores do enum', () => {
    for (const modelId of Object.values(CursorReviewerModelId)) {
      assert.equal(assertSupportedCursorReviewerModelId(modelId), modelId);
    }
  });
});

describe('resolveAgentModelSelection', () => {
  it('usa composer-2.5 quando id vazio', () => {
    assert.deepEqual(resolveAgentModelSelection(''), { id: 'composer-2.5' });
  });

  it('repassa override explícito válido', () => {
    assert.deepEqual(resolveAgentModelSelection('gpt-5.4'), { id: 'gpt-5.4' });
  });
});
