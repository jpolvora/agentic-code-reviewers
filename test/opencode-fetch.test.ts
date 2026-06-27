import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOpencodeFetch, closeAllOpencodeAgents, isHeadersTimeoutError, withAbortSignal } from '../src/engine/opencode/fetch.js';

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

  it('createOpencodeFetch aceita Request global (SDK OpenCode passa só Request)', async () => {
    const runFetch = createOpencodeFetch(600_000);
    const request = new Request('http://127.0.0.1:9/test', { method: 'GET' });
    await assert.rejects(
      runFetch(request),
      (error: Error & { cause?: { code?: string } }) =>
        error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed'),
    );
  });

  it('createOpencodeFetch com runSignal rejeita imediatamente após abort', async () => {
    const runController = new AbortController();
    const runFetch = createOpencodeFetch(600_000, runController.signal);
    runController.abort();
    await assert.rejects(
      runFetch('http://127.0.0.1:9/test', {}),
      (error: Error) => error.name === 'AbortError',
    );
  });

  it('closeAllOpencodeAgents fecha agents cacheados', async () => {
    createOpencodeFetch(600_000);
    createOpencodeFetch(300_000);
    await closeAllOpencodeAgents();
    const fetch = createOpencodeFetch(600_000);
    assert.equal(typeof fetch, 'function');
  });
});
