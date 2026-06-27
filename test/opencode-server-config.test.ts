import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import {
  buildOpencodeServerConfig,
  resolveServerLogEnabled,
  resolveServerLogLevel,
} from '../src/engine/opencode/server-config.js';

const saved = new Map<string, string | undefined>();

function setEnv(key: string, value: string | undefined): void {
  if (!saved.has(key)) {
    saved.set(key, process.env[key]);
  }
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

function clearKeys(...keys: string[]): void {
  for (const key of keys) {
    setEnv(key, undefined);
  }
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  saved.clear();
});

describe('opencode server-config', () => {
  it('resolveServerLogEnabled é true por padrão', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG');
    assert.equal(resolveServerLogEnabled(), true);
  });

  it('resolveServerLogEnabled respeita false/0/off', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG', 'false');
    assert.equal(resolveServerLogEnabled(), false);

    setEnv('AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG', '0');
    assert.equal(resolveServerLogEnabled(), false);

    setEnv('AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG', 'off');
    assert.equal(resolveServerLogEnabled(), false);
  });

  it('resolveServerLogLevel usa DEBUG por padrão quando log está habilitado', () => {
    clearKeys(
      'AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL',
      'AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG',
    );
    assert.equal(resolveServerLogLevel(), 'DEBUG');
  });

  it('resolveServerLogLevel honra env explícito', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL', 'WARN');
    assert.equal(resolveServerLogLevel(), 'WARN');
  });

  it('resolveServerLogLevel retorna undefined quando server log desabilitado', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL');
    setEnv('AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG', 'false');
    assert.equal(resolveServerLogLevel(), undefined);
  });

  it('buildOpencodeServerConfig nega permissões interativas', () => {
    clearKeys(
      'AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL',
      'AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG',
    );
    const config = buildOpencodeServerConfig('opencode-go/deepseek-v4-flash');

    assert.equal(config.model, 'opencode-go/deepseek-v4-flash');
    assert.equal(config.logLevel, 'DEBUG');
    assert.deepEqual(config.permission, {
      edit: 'deny',
      bash: 'deny',
      webfetch: 'deny',
      external_directory: 'deny',
      doom_loop: 'deny',
    });
  });

  it('buildOpencodeServerConfig injeta instructions do harness do projeto', () => {
    clearKeys(
      'AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL',
      'AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG',
    );
    const config = buildOpencodeServerConfig('opencode-go/deepseek-v4-flash');

    assert.ok(config.instructions?.includes('AGENTS.md'));
    assert.ok(config.instructions?.includes('.cursor/rules/*.mdc'));
    assert.ok(config.instructions?.includes('.agents/skills/code-review/SKILL.md'));
    assert.ok(config.instructions?.includes('docs/**/*.md'));
  });
});
