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

  it('inclui variant no body e no model quando variant é informado', () => {
    const body = buildSessionPromptBody(
      'explore',
      'hello',
      {
        providerID: 'opencode-go',
        modelID: 'deepseek-v4-flash',
        composite: 'opencode-go/deepseek-v4-flash',
      },
      'high',
    );

    assert.equal(body.agent, 'explore');
    assert.equal(body.variant, 'high');
    assert.deepEqual(body.model, {
      providerID: 'opencode-go',
      modelID: 'deepseek-v4-flash',
      variant: 'high',
    });
  });

  it('inclui variant no body mesmo sem model', () => {
    const body = buildSessionPromptBody('explore', 'hello', undefined, 'medium');
    assert.equal(body.model, undefined);
    assert.equal(body.variant, 'medium');
  });

  it('omite model no body de fallback', () => {
    const body = buildSessionPromptBody('explore', 'hello');
    assert.equal(body.model, undefined);
    assert.equal(body.variant, undefined);
  });

  it('shouldFallbackSessionPromptWithoutModel é true para erros do SDK', () => {
    assert.equal(shouldFallbackSessionPromptWithoutModel({ name: 'UnknownError' }), true);
    assert.equal(shouldFallbackSessionPromptWithoutModel(undefined), false);
  });
});
