import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildOpencodeServerUrl,
  formatOpencodeNotFoundError,
  isOpencodeNotFoundError,
  isServeErrorOutput,
  parseOpencodeServerListenUrl,
  parseUrlPort,
  probeOpencodePort,
  resolveOpencodeBinary,
  reserveFreePort,
  shouldOwnEmbeddedOpencodeServer,
} from '../src/engine/opencode/server.js';

describe('opencode server', () => {
  it('buildOpencodeServerUrl monta URL http', () => {
    assert.equal(buildOpencodeServerUrl('127.0.0.1', 4096), 'http://127.0.0.1:4096');
  });

  it('parseUrlPort extrai porta da URL de listen', () => {
    assert.equal(parseUrlPort('http://127.0.0.1:4097'), 4097);
    assert.equal(parseUrlPort('http://127.0.0.1:4096'), 4096);
  });

  it('isServeErrorOutput detecta ServeError no output do CLI', () => {
    assert.equal(isServeErrorOutput('Error: Unexpected error\n\nServeError'), true);
    assert.equal(isServeErrorOutput('opencode server listening on http://127.0.0.1:4096'), false);
  });

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

  it('reserveFreePort retorna porta TCP livre', async () => {
    const port = await reserveFreePort('127.0.0.1');
    assert.ok(port > 0);
  });

  it('probeOpencodePort retorna free em porta não utilizada', async () => {
    const port = await reserveFreePort('127.0.0.1');
    assert.equal(await probeOpencodePort('127.0.0.1', port), 'free');
  });

  it('resolveOpencodeBinary prefere caminho explícito existente', () => {
    assert.equal(resolveOpencodeBinary(process.execPath), process.execPath);
  });

  it('formatOpencodeNotFoundError menciona install e OPENCODE_BIN', () => {
    const message = formatOpencodeNotFoundError();
    assert.match(message, /opencode\.ai\/install/);
    assert.match(message, /OPENCODE_BIN/);
  });

  it('isOpencodeNotFoundError detecta ENOENT', () => {
    assert.equal(isOpencodeNotFoundError({ code: 'ENOENT' }), true);
    assert.equal(isOpencodeNotFoundError(new Error('x', { cause: { code: 'ENOENT' } })), true);
    assert.equal(isOpencodeNotFoundError(new Error('other')), false);
  });

  it('shouldOwnEmbeddedOpencodeServer ignora reuse quando há harness embutido', () => {
    assert.equal(
      shouldOwnEmbeddedOpencodeServer({
        permission: { edit: 'deny' },
        instructions: ['read AGENTS.md'],
      }),
      true,
    );
    assert.equal(shouldOwnEmbeddedOpencodeServer({ permission: { edit: 'deny' } }, true), false);
    assert.equal(shouldOwnEmbeddedOpencodeServer(undefined), false);
  });
});
