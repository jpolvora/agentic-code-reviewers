import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  directoriesMatch,
  eventBelongsToSession,
  extractPartStreamChunk,
  formatRawEventForLog,
  formatSessionStatus,
  formatToolPart,
  isGlobalEvent,
  permissionReplyForType,
} from '../src/engine/opencode/event-stream.js';

describe('opencode event-stream', () => {
  it('directoriesMatch compara paths resolvidos', () => {
    assert.equal(directoriesMatch('/repo', '/repo/'), true);
  });

  it('permissionReplyForType rejeita operações de escrita', () => {
    assert.equal(permissionReplyForType('edit'), 'reject');
    assert.equal(permissionReplyForType('bash'), 'reject');
    assert.equal(permissionReplyForType('external_directory'), 'reject');
  });

  it('formatSessionStatus descreve retry com attempt', () => {
    assert.equal(
      formatSessionStatus({ type: 'retry', attempt: 2, message: 'rate limited' }),
      'retry attempt=2: rate limited',
    );
  });

  it('formatSessionStatus descreve busy e idle', () => {
    assert.equal(formatSessionStatus({ type: 'busy' }), 'busy');
    assert.equal(formatSessionStatus({ type: 'idle' }), 'idle');
  });

  it('formatToolPart omite título quando não concluído', () => {
    assert.equal(
      formatToolPart({
        id: 'p2',
        sessionID: 's1',
        messageID: 'm1',
        type: 'tool',
        callID: 'c2',
        tool: 'grep',
        state: {
          status: 'running',
          input: {},
          time: { start: 0 },
        },
      }),
      'grep — running',
    );
  });

  it('directoriesMatch retorna false para paths diferentes', () => {
    assert.equal(directoriesMatch('/repo-a', '/repo-b'), false);
  });

  it('eventBelongsToSession filtra por sessionID e permite session.error sem ID', () => {
    assert.equal(
      eventBelongsToSession(
        { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'busy' } } },
        'ses_1',
      ),
      true,
    );
    assert.equal(
      eventBelongsToSession(
        { type: 'session.status', properties: { sessionID: 'ses_2', status: { type: 'busy' } } },
        'ses_1',
      ),
      false,
    );
    assert.equal(
      eventBelongsToSession({ type: 'session.error', properties: { error: { name: 'ApiError', data: {} } } }, 'ses_1'),
      true,
    );
  });

  it('permissionReplyForType rejeita tipos desconhecidos', () => {
    assert.equal(permissionReplyForType('read'), 'reject');
  });

  it('formatToolPart inclui título quando concluído', () => {
    assert.equal(
      formatToolPart({
        id: 'p1',
        sessionID: 's1',
        messageID: 'm1',
        type: 'tool',
        callID: 'c1',
        tool: 'read',
        state: {
          status: 'completed',
          input: {},
          output: 'ok',
          title: 'Read file',
          metadata: {},
          time: { start: 0, end: 1 },
        },
      }),
      'read — completed — Read file',
    );
  });

  it('formatRawEventForLog serializa eventos desconhecidos para debug', () => {
    assert.equal(formatRawEventForLog(undefined), 'undefined');
    assert.equal(formatRawEventForLog('ping'), 'ping');
    assert.equal(
      formatRawEventForLog({ payload: { type: 'session.idle' } }),
      '{"payload":{"type":"session.idle"}}',
    );
  });

  it('isGlobalEvent valida estrutura directory/payload do SSE', () => {
    assert.equal(
      isGlobalEvent({
        directory: '/repo',
        payload: { type: 'session.status', properties: { sessionID: 'ses_1', status: { type: 'busy' } } },
      }),
      true,
    );
    assert.equal(isGlobalEvent({ directory: '/repo' }), true);
    assert.equal(isGlobalEvent(null), false);
    assert.equal(isGlobalEvent('event'), false);
    assert.equal(isGlobalEvent({ directory: 42 }), false);
    assert.equal(isGlobalEvent({ payload: { type: 'session.idle' } }), false);
    assert.equal(isGlobalEvent({ payload: { properties: {} } }), false);
  });

  it('extractPartStreamChunk usa delta ou diff de part.text', () => {
    const part = {
      id: 'p1',
      sessionID: 's1',
      messageID: 'm1',
      type: 'reasoning' as const,
      text: 'hello world',
      time: { start: 0 },
    };
    const fromDelta = extractPartStreamChunk(part, 0, 'hello');
    assert.deepEqual(fromDelta, { chunk: 'hello', nextLength: 5 });

    const fromText = extractPartStreamChunk(part, 5, undefined);
    assert.deepEqual(fromText, { chunk: ' world', nextLength: 11 });

    assert.equal(extractPartStreamChunk(part, 11, undefined), undefined);
  });
});
