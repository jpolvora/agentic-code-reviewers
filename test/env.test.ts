import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { ENV, ENV_PREFIX, env, readEnv } from '../src/env.js';

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

describe('env', () => {
  it('expõe prefixo canônico AGENTIC_CODE_REVIEWERS_', () => {
    assert.equal(ENV_PREFIX, 'AGENTIC_CODE_REVIEWERS_');
    assert.equal(ENV.CURSOR_API_KEY, 'CURSOR_API_KEY');
    assert.equal(ENV.OPENCODE_API_KEY, 'OPENCODE_API_KEY');
    assert.equal(ENV.ENGINE, 'AGENTIC_CODE_REVIEWERS_ENGINE');
    assert.equal(ENV.SCORE_MIN, 'AGENTIC_CODE_REVIEWERS_SCORE_MIN');
  });

  it('env.cursorApiKey lê CURSOR_API_KEY e trima espaços', () => {
    setEnv('CURSOR_API_KEY', '  cursor_direct  ');
    assert.equal(env.cursorApiKey(), 'cursor_direct');
  });

  it('readEnv lê apenas variável com prefixo AGENTIC_CODE_REVIEWERS_', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_ENGINE', 'opencode');
    setEnv('CURSOR_REVIEWER_ENGINE', 'cursor-sdk');
    assert.equal(readEnv('ENGINE'), 'opencode');
  });

  it('readEnv ignora valor canônico só com espaços', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_ENGINE', '   ');
    assert.equal(readEnv('ENGINE'), undefined);
  });

  it('readEnv retorna valor canônico trimado', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_MODEL', '  composer-2.5  ');
    assert.equal(readEnv('MODEL'), 'composer-2.5');
  });

  it('readEnv retorna undefined quando a chave não está definida', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_STACK');
    assert.equal(readEnv('STACK'), undefined);
  });

  it('env.scoreMin lê AGENTIC_CODE_REVIEWERS_SCORE_MIN', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_SCORE_MIN', '4');
    assert.equal(env.scoreMin(), '4');
  });

  it('env.azureDevOpsPat lê AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT', 'pat_value');
    assert.equal(env.azureDevOpsPat(), 'pat_value');
  });

  it('env.opencodeServerLog lê variável canônica', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG', 'false');
    assert.equal(env.opencodeServerLog(), 'false');
  });

  it('env.opencodeLogLevel lê variável canônica', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL', 'DEBUG');
    assert.equal(env.opencodeLogLevel(), 'DEBUG');
  });

  it('env expõe chaves OpenCode de logging', () => {
    assert.equal(ENV.OPENCODE_SERVER_LOG, 'AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG');
    assert.equal(ENV.OPENCODE_LOG_LEVEL, 'AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL');
  });

  it('env.githubToken lê AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN', 'gh_canonical');
    assert.equal(env.githubToken(), 'gh_canonical');
  });

  it('env.githubToken faz fallback para GITHUB_TOKEN e GH_TOKEN', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN');
    setEnv('GITHUB_TOKEN', 'gh_native');
    assert.equal(env.githubToken(), 'gh_native');

    clearKeys('GITHUB_TOKEN');
    setEnv('GH_TOKEN', 'gh_cli');
    assert.equal(env.githubToken(), 'gh_cli');
  });

  it('env.maxRounds lê AGENTIC_CODE_REVIEWERS_MAX_ROUNDS', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_MAX_ROUNDS', '3');
    assert.equal(env.maxRounds(), '3');
  });

  it('env.targetBranch lê AGENTIC_CODE_REVIEWERS_TARGET_BRANCH', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_TARGET_BRANCH', 'refs/heads/develop');
    assert.equal(env.targetBranch(), 'refs/heads/develop');
  });
});
