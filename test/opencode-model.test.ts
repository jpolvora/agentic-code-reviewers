import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertOpencodeModel,
  DEFAULT_OPENCODE_MODEL,
  resolveOpencodeModelSelection,
} from '../src/engine/opencode/model.js';

describe('opencode model', () => {
  it('decompõe provider/model', () => {
    const selection = resolveOpencodeModelSelection('anthropic/claude-sonnet-4-6');
    assert.equal(selection.providerID, 'anthropic');
    assert.equal(selection.modelID, 'claude-sonnet-4-6');
    assert.equal(selection.composite, 'anthropic/claude-sonnet-4-6');
  });

  it('aceita provider com barra no model id', () => {
    const selection = resolveOpencodeModelSelection('openrouter/anthropic/claude-3.5');
    assert.equal(selection.providerID, 'openrouter');
    assert.equal(selection.modelID, 'anthropic/claude-3.5');
  });

  it('rejeita modelo sem barra', () => {
    assert.throws(() => resolveOpencodeModelSelection('composer-2.5'), /Modelo opencode inválido/);
  });

  it('assertOpencodeModel retorna string normalizada', () => {
    assert.equal(assertOpencodeModel(` ${DEFAULT_OPENCODE_MODEL} `), DEFAULT_OPENCODE_MODEL);
  });
});
