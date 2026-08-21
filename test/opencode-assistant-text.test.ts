import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AssistantMessage, Part } from '@opencode-ai/sdk';
import {
  extractTextFromParts,
  formatIncompleteAssistantDiagnostics,
  isRetryableIncompleteAssistant,
  summarizePartTypes,
} from '../src/engine/opencode/assistant-text.js';

function textPart(text: string, ignored = false): Part {
  return {
    id: 'p1',
    sessionID: 's1',
    messageID: 'm1',
    type: 'text',
    text,
    ignored,
  } as Part;
}

function reasoningPart(text: string): Part {
  return {
    id: 'p2',
    sessionID: 's1',
    messageID: 'm1',
    type: 'reasoning',
    text,
  } as Part;
}

function assistantInfo(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    id: 'm1',
    sessionID: 's1',
    role: 'assistant',
    time: { created: 0 },
    parentID: 'u1',
    modelID: 'mimo-v2.5',
    providerID: 'opencode-go',
    mode: 'explore',
    path: { cwd: '/', root: '/' },
    cost: 0,
    tokens: { input: 10, output: 0, reasoning: 50, cache: { read: 0, write: 0 } },
    finish: 'stop',
    ...overrides,
  } as AssistantMessage;
}

describe('opencode assistant-text', () => {
  it('extractTextFromParts junta text parts e ignora ignored', () => {
    const parts = [textPart('hello '), textPart('world', true), textPart('!')];
    assert.equal(extractTextFromParts(parts), 'hello !');
  });

  it('extractTextFromParts retorna vazio quando só há reasoning', () => {
    assert.equal(extractTextFromParts([reasoningPart('thinking...')]), '');
  });

  it('summarizePartTypes conta tipos', () => {
    assert.equal(summarizePartTypes([textPart('a'), reasoningPart('b'), textPart('c')]), 'text:2, reasoning:1');
    assert.equal(summarizePartTypes([]), '(none)');
  });

  it('isRetryableIncompleteAssistant: empty text sem error', () => {
    assert.equal(isRetryableIncompleteAssistant(assistantInfo(), ''), true);
  });

  it('isRetryableIncompleteAssistant: false quando há texto', () => {
    assert.equal(isRetryableIncompleteAssistant(assistantInfo(), '{"reviews":[]}'), false);
  });

  it('isRetryableIncompleteAssistant: MessageOutputLengthError é retryable', () => {
    const info = assistantInfo({
      error: { name: 'MessageOutputLengthError', data: {} },
    });
    assert.equal(isRetryableIncompleteAssistant(info, ''), true);
  });

  it('isRetryableIncompleteAssistant: outros erros não são retryable', () => {
    const info = assistantInfo({
      error: { name: 'ProviderAuthError', data: { providerID: 'x', message: 'no' } },
    });
    assert.equal(isRetryableIncompleteAssistant(info, ''), false);
  });

  it('formatIncompleteAssistantDiagnostics inclui finish/parts/tokens', () => {
    const diag = formatIncompleteAssistantDiagnostics(assistantInfo(), [reasoningPart('x')]);
    assert.match(diag, /finish=stop/);
    assert.match(diag, /error=none/);
    assert.match(diag, /reasoning:1/);
    assert.match(diag, /reasoning=50/);
  });
});
