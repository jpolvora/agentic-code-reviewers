import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSessionPromptBody, shouldFallbackSessionPromptWithoutModel } from '../src/engine/opencode/prompt-body.js';

describe('opencode prompt-body', () => {
  it('inclui provider/model no body quando modelSelection é informado', () => {
    const body = buildSessionPromptBody('explore', 'hello', {
      providerID: 'opencode-go',
      modelID: 'deepseek-v4-flash',
      composite: 'opencode-go/deepseek-v4-flash',
    });

    assert.equal(body.agent, 'explore');
    assert.equal(body.parts[0]?.text, 'hello');
    assert.deepEqual(body.model, {
      providerID: 'opencode-go',
      modelID: 'deepseek-v4-flash',
    });
  });

  it('omite model no body de fallback', () => {
    const body = buildSessionPromptBody('explore', 'hello');
    assert.equal(body.model, undefined);
  });

  it('shouldFallbackSessionPromptWithoutModel é true para erros do SDK', () => {
    assert.equal(shouldFallbackSessionPromptWithoutModel({ name: 'UnknownError' }), true);
    assert.equal(shouldFallbackSessionPromptWithoutModel(undefined), false);
  });
});
