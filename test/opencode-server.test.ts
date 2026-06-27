import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOpencodeServerListenUrl } from '../src/engine/opencode/server.js';

describe('opencode server', () => {
  it('parseOpencodeServerListenUrl extrai URL do log de startup', () => {
    assert.equal(
      parseOpencodeServerListenUrl('opencode server listening on http://127.0.0.1:4096'),
      'http://127.0.0.1:4096',
    );
  });

  it('parseOpencodeServerListenUrl retorna undefined para linhas irrelevantes', () => {
    assert.equal(parseOpencodeServerListenUrl('starting...'), undefined);
    assert.equal(parseOpencodeServerListenUrl('opencode server failed'), undefined);
  });
});
