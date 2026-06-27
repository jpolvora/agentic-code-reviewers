import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildAutoFixCommitMessage } from '../src/git/autofix-commit.js';
import type { ReviewerConfig } from '../src/config.js';

describe('buildAutoFixCommitMessage', () => {
  it('inclui número da PR quando disponível', () => {
    const msg = buildAutoFixCommitMessage({ pullRequestId: 42 } as ReviewerConfig);
    assert.match(msg, /PR #42/);
    assert.match(msg, /^fix\(review\):/);
  });

  it('usa mensagem genérica sem PR id', () => {
    const msg = buildAutoFixCommitMessage({ pullRequestId: 0 } as ReviewerConfig);
    assert.equal(msg, 'fix(review): apply auto-fixes for active review threads');
  });
});
