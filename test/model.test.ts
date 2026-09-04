import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CANONICAL_COMPOSER_25_MODEL_ID,
  DEFAULT_CURSOR_REVIEWER_MODEL,
  resolveAgentModelSelection,
  resolveCursorModelShape,
  validateCursorModelId,
} from '../src/engine/cursor-sdk/model.js';
import { ModelCatalogError, UnsupportedModelError } from '../src/engine/types.js';

const catalog = [
  { id: 'composer-2.5' },
  { id: 'gpt-5.6-luna-high' },
  { id: 'claude-sonnet-4-6', aliases: ['sonnet'] },
];

describe('cursor model shape', () => {
  it('usa composer-2.5 como default canônico', () => {
    assert.equal(CANONICAL_COMPOSER_25_MODEL_ID, 'composer-2.5');
    assert.equal(DEFAULT_CURSOR_REVIEWER_MODEL, 'composer-2.5');
    assert.equal(resolveCursorModelShape(''), 'composer-2.5');
    assert.equal(resolveCursorModelShape('  '), 'composer-2.5');
  });

  it('resolveAgentModelSelection preserva o id (shape-only, sem catálogo)', () => {
    assert.deepEqual(resolveAgentModelSelection(''), { id: 'composer-2.5' });
    assert.deepEqual(resolveAgentModelSelection('gpt-5.6-luna-high'), { id: 'gpt-5.6-luna-high' });
  });
});

describe('validateCursorModelId (catálogo live)', () => {
  it('aceita modelo disponível e preserva o id exato', async () => {
    const id = await validateCursorModelId('gpt-5.6-luna-high', async () => catalog);
    assert.equal(id, 'gpt-5.6-luna-high');
  });

  it('resolve alias para o id canônico do catálogo', async () => {
    const id = await validateCursorModelId('sonnet', async () => catalog);
    assert.equal(id, 'claude-sonnet-4-6');
  });

  it('rejeita modelo ausente com UnsupportedModelError e ids descobertos', async () => {
    await assert.rejects(
      validateCursorModelId('gpt-5.4-medium', async () => catalog),
      (error: unknown) => {
        assert.ok(error instanceof UnsupportedModelError);
        assert.equal(error.requested, 'gpt-5.4-medium');
        assert.ok(error.available.includes('gpt-5.6-luna-high'));
        assert.match(error.message, /Modelo inválido/);
        assert.match(error.message, /gpt-5\.4-medium/);
        return true;
      },
    );
  });

  it('falha de catálogo vira ModelCatalogError sem fallback (distinto de modelo inválido)', async () => {
    await assert.rejects(
      validateCursorModelId('gpt-5.6-luna-high', async () => {
        throw new Error('auth 401');
      }),
      (error: unknown) => {
        assert.ok(error instanceof ModelCatalogError);
        assert.ok(!(error instanceof UnsupportedModelError));
        assert.match(error.message, /catálogo/);
        assert.match(error.message, /CURSOR_API_KEY/);
        return true;
      },
    );
  });

  it('usa default quando id vazio e o default está no catálogo', async () => {
    const id = await validateCursorModelId('', async () => catalog);
    assert.equal(id, 'composer-2.5');
  });
});
