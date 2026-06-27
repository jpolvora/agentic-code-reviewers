import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOpencodeFetch, isHeadersTimeoutError, withAbortSignal } from '../src/engine/opencode/fetch.js';

describe('opencode fetch', () => {
  it('createOpencodeFetch retorna função fetch', () => {
    const fetch = createOpencodeFetch(600_000);
    assert.equal(typeof fetch, 'function');
  });

  it('isHeadersTimeoutError detecta code no erro ou na cadeia cause', () => {
    assert.equal(isHeadersTimeoutError({ code: 'UND_ERR_HEADERS_TIMEOUT' }), true);
    assert.equal(
      isHeadersTimeoutError(new TypeError('fetch failed', { cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } })),
      true,
    );
    assert.equal(isHeadersTimeoutError({ code: 'UND_ERR_BODY_TIMEOUT' }), true);
    assert.equal(isHeadersTimeoutError(new Error('other')), false);
  });

  it('withAbortSignal rejeita quando signal aborta', async () => {
    const controller = new AbortController();
    const pending = withAbortSignal(
      controller.signal,
      new Promise<string>(() => {}),
    );
    controller.abort();
    await assert.rejects(pending, (error: Error) => error.name === 'AbortError');
  });
});
