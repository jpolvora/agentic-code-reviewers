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

  it('createOpencodeFetch sem runSignal não herda abort do run', async () => {
    const runController = new AbortController();
    const runFetch = createOpencodeFetch(600_000, runController.signal);
    const cleanupFetch = createOpencodeFetch(600_000);

    const originalFetch = globalThis.fetch;
    const seenAborted: boolean[] = [];

    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      seenAborted.push(init?.signal?.aborted ?? false);
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
      }
      return Promise.resolve(new Response(null, { status: 204 }));
    }) as typeof fetch;

    try {
      runController.abort();
      await assert.rejects(runFetch('http://example.test/run', {}), (error: Error) => error.name === 'AbortError');
      await cleanupFetch('http://example.test/cleanup', {});
      assert.deepEqual(seenAborted, [true, false]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
