import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createEngine,
  getEngine,
  listSupportedEngineInputs,
  listSupportedEngines,
  parseEngineName,
} from '../src/engine/index.js';
import { UnsupportedModelError } from '../src/engine/types.js';

describe('engine registry (capability-based)', () => {
  it('registra cursor-sdk e opencode; aliases resolvem consistentemente', () => {
    assert.deepEqual(listSupportedEngines(), ['cursor-sdk', 'opencode']);
    assert.equal(parseEngineName(undefined), 'cursor-sdk');
    assert.equal(parseEngineName('cursor'), 'cursor-sdk');
    assert.equal(parseEngineName('cursor-sdk'), 'cursor-sdk');
    assert.equal(parseEngineName('opencode'), 'opencode');
    assert.ok(listSupportedEngineInputs().includes('cursor'));
  });

  it('rejeita engine desconhecida independente de modelo', () => {
    assert.throws(() => parseEngineName('invalid-engine'), /Engine inválido/);
  });

  it('getEngine delega ao registry', () => {
    assert.equal(getEngine({ engine: 'cursor-sdk' } as never).engineName, 'cursor-sdk');
    assert.equal(getEngine({ engine: 'opencode' } as never).engineName, 'opencode');
  });
});

describe('engine model capability parity', () => {
  it('ambos os engines expõem validateModel atrás do contrato comum', () => {
    for (const name of listSupportedEngines()) {
      const engine = createEngine(name);
      assert.equal(typeof engine.validateModel, 'function');
      assert.equal(typeof engine.run, 'function');
    }
  });

  it('opencode valida provider/model sem catálogo Cursor', async () => {
    const engine = createEngine('opencode');
    assert.equal(await engine.validateModel('openai/gpt-4.1'), 'openai/gpt-4.1');
    await assert.rejects(engine.validateModel('composer-2.5'), /opencode inválido/);
  });

  it('cursor-sdk valida contra o catálogo injetado (sem rede)', async () => {
    const { CursorSdkEngine } = await import('../src/engine/cursor-sdk/engine.js');
    const { ModelCatalogError } = await import('../src/engine/types.js');
    const engine = new CursorSdkEngine(async () => [{ id: 'composer-2.5' }, { id: 'gpt-5.6-luna-high' }]);
    assert.equal(await engine.validateModel('gpt-5.6-luna-high'), 'gpt-5.6-luna-high');
    await assert.rejects(engine.validateModel('nope-1'), UnsupportedModelError);
    const failing = new CursorSdkEngine(async () => {
      throw new Error('auth 401');
    });
    await assert.rejects(failing.validateModel('composer-2.5'), ModelCatalogError);
  });

  it('shapes de erro distinguem modelo inválido de falha de catálogo', () => {
    const err = new UnsupportedModelError('cursor-sdk', 'x', ['a']);
    assert.match(err.message, /Modelo inválido/);
    assert.match(err.message, /Modelos disponíveis/);
  });
});
