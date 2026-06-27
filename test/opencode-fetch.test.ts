import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOpencodeFetch } from '../src/engine/opencode/fetch.js';

describe('opencode fetch', () => {
  it('createOpencodeFetch retorna função fetch', () => {
    const fetch = createOpencodeFetch(600_000);
    assert.equal(typeof fetch, 'function');
  });
});
