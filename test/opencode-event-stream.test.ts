import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  directoriesMatch,
  formatSessionStatus,
  formatToolPart,
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
});
