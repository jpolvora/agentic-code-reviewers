import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  OPENCODE_RUNNER_HARNESS_INSTRUCTIONS,
  resolveOpencodeHarnessInstructions,
} from '../src/engine/opencode/harness-instructions.js';

describe('opencode harness-instructions', () => {
  it('expõe globs alinhados ao harness do projeto (CODE_REVIEW.md)', () => {
    assert.deepEqual([...OPENCODE_RUNNER_HARNESS_INSTRUCTIONS], [
      'AGENTS.md',
      '.opencode/AGENTS.md',
      '.cursor/rules/*.mdc',
      '.cursor/rules/*.md',
      '.agents/skills/code-review/SKILL.md',
      'docs/**/*.md',
    ]);
  });

  it('resolveOpencodeHarnessInstructions retorna a lista canônica', () => {
    assert.equal(
      resolveOpencodeHarnessInstructions(),
      OPENCODE_RUNNER_HARNESS_INSTRUCTIONS,
    );
  });
});
