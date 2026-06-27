import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyReplacements } from '../src/orchestrator/autofix-runner.js';

describe('applyReplacements', () => {
  it('aplica substituição simples em arquivo', () => {
    const original = 'linha 1\nlinha 2\nlinha 3';
    const replacements = [
      {
        startLine: 2,
        endLine: 2,
        replacementContent: 'linha 2 corrigida',
      },
    ];
    const result = applyReplacements(original, replacements);
    assert.equal(result, 'linha 1\nlinha 2 corrigida\nlinha 3');
  });

  it('ordena substituições de baixo para cima corretamente', () => {
    const original = 'linha 1\nlinha 2\nlinha 3\nlinha 4';
    const replacements = [
      {
        startLine: 2,
        endLine: 2,
        replacementContent: 'linha 2 alterada',
      },
      {
        startLine: 4,
        endLine: 4,
        replacementContent: 'linha 4 alterada',
      },
    ];
    const result = applyReplacements(original, replacements);
    assert.equal(result, 'linha 1\nlinha 2 alterada\nlinha 3\nlinha 4 alterada');
  });

  it('preserva finais de linha CRLF', () => {
    const original = 'linha 1\r\nlinha 2\r\nlinha 3';
    const replacements = [
      {
        startLine: 2,
        endLine: 2,
        replacementContent: 'linha 2 corrigida',
      },
    ];
    const result = applyReplacements(original, replacements);
    assert.equal(result, 'linha 1\r\nlinha 2 corrigida\r\nlinha 3');
  });

  it('lança erro para limites fora do arquivo', () => {
    const original = 'linha 1\nlinha 2';
    const replacements = [
      {
        startLine: 3,
        endLine: 3,
        replacementContent: 'erro',
      },
    ];
    assert.throws(() => {
      applyReplacements(original, replacements);
    }, /Substituição fora dos limites/);
  });
});
