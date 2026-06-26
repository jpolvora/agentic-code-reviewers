import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  backoffDelayMs,
  isJwtAccessToken,
  isRetryableHttpStatus,
  paginateGraphqlConnection,
  parseRetryAfterSeconds,
} from '../src/http-retry.js';

describe('http-retry helpers', () => {
  it('isRetryableHttpStatus aceita 429 e 5xx', () => {
    assert.equal(isRetryableHttpStatus(429), true);
    assert.equal(isRetryableHttpStatus(500), true);
    assert.equal(isRetryableHttpStatus(503), true);
    assert.equal(isRetryableHttpStatus(404), false);
    assert.equal(isRetryableHttpStatus(401), false);
  });

  it('parseRetryAfterSeconds interpreta segundos e data HTTP', () => {
    assert.equal(parseRetryAfterSeconds('12'), 12);
    const future = new Date(Date.now() + 5000).toUTCString();
    const parsed = parseRetryAfterSeconds(future);
    assert.ok(parsed != null && parsed >= 4 && parsed <= 6);
    assert.equal(parseRetryAfterSeconds(null), undefined);
  });

  it('backoffDelayMs respeita Retry-After com teto de 30s', () => {
    assert.equal(backoffDelayMs(1), 1000);
    assert.equal(backoffDelayMs(2), 2000);
    assert.equal(backoffDelayMs(1, 120), 30_000);
  });

  it('isJwtAccessToken detecta JWT pelo prefixo eyJ', () => {
    assert.equal(isJwtAccessToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig'), true);
    assert.equal(isJwtAccessToken('4xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), false);
    assert.equal(isJwtAccessToken('pat.with.dots.but.not.jwt'), false);
  });

  it('paginateGraphqlConnection percorre todas as páginas', async () => {
    const pages: Array<string | null> = [];
    const items = await paginateGraphqlConnection(async (after) => {
      pages.push(after);
      if (after == null) {
        return {
          nodes: ['a', 'b'],
          pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
        };
      }
      return {
        nodes: ['c'],
        pageInfo: { hasNextPage: false, endCursor: null },
      };
    });

    assert.deepEqual(items, ['a', 'b', 'c']);
    assert.deepEqual(pages, [null, 'cursor-1']);
  });

  it('paginateGraphqlConnection pode iniciar após cursor intermediário', async () => {
    const pages: Array<string | null> = [];
    const items = await paginateGraphqlConnection(
      async (after) => {
        pages.push(after);
        return {
          nodes: ['page-2'],
          pageInfo: { hasNextPage: false, endCursor: null },
        };
      },
      'cursor-1',
    );

    assert.deepEqual(items, ['page-2']);
    assert.deepEqual(pages, ['cursor-1']);
  });
});
