import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildPullRequestContextForLlm,
  formatReviewStartLogMessage,
} from '../src/ado/pull-request.js';

describe('formatReviewStartLogMessage', () => {
  it('inclui número da PR e título', () => {
    assert.equal(
      formatReviewStartLogMessage(789, 'Equipamentos Florestais'),
      'Iniciando revisão somente leitura da PR #789 sobre Equipamentos Florestais.',
    );
  });

  it('omite título quando ausente', () => {
    assert.equal(
      formatReviewStartLogMessage(789),
      'Iniciando revisão somente leitura da PR #789.',
    );
  });
});

describe('buildPullRequestContextForLlm', () => {
  it('destaca Pull Request ID e distingue de Work Items', () => {
    const context = buildPullRequestContextForLlm(789, 'Equipamentos Florestais', 'Descrição curta');

    assert.ok(context.includes('**Pull Request ID:** #789'));
    assert.ok(context.includes('IDs numéricos de Work Items'));
    assert.ok(context.includes('**Título:** Equipamentos Florestais'));
    assert.ok(context.includes('Descrição curta'));
  });
});
