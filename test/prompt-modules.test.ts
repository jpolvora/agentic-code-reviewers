import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectPromptModuleIds } from '../src/agent/prompt-modules.js';

describe('selectPromptModuleIds', () => {
  it('selects security module for auth paths', () => {
    const ids = selectPromptModuleIds(['src/auth/login.ts'], []);
    assert.ok(ids.includes('security'));
  });

  it('respects forced modules from env', () => {
    const ids = selectPromptModuleIds(['src/utils.ts'], ['performance', 'tests']);
    assert.deepEqual(ids, ['performance', 'tests']);
  });
});
