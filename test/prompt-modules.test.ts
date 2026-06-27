import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
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

  it('filters out invalid forced module IDs and warns', () => {
    const warnMock = mock.method(console, 'warn', () => {});
    try {
      const ids = selectPromptModuleIds([], ['securty', 'performance', 'nonexistent']);
      // Only valid IDs survive
      assert.deepEqual(ids, ['performance']);
      // Warning was emitted
      assert.equal(warnMock.mock.calls.length, 1);
      const warnMsg = String(warnMock.mock.calls[0]!.arguments[0]);
      assert.ok(warnMsg.includes('securty'));
      assert.ok(warnMsg.includes('nonexistent'));
    } finally {
      warnMock.mock.restore();
    }
  });

  it('returns empty array when all forced IDs are invalid', () => {
    const warnMock = mock.method(console, 'warn', () => {});
    try {
      const ids = selectPromptModuleIds([], ['bogus']);
      assert.deepEqual(ids, []);
    } finally {
      warnMock.mock.restore();
    }
  });
});
