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
    assert.equal(ENV.CURSOR_API_KEY, 'AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY');
    assert.equal(ENV.ENGINE, 'AGENTIC_CODE_REVIEWERS_ENGINE');
    assert.equal(ENV.SCORE_MIN, 'AGENTIC_CODE_REVIEWERS_SCORE_MIN');
    assert.equal(ENV.EXECUTION_MODE, 'AGENTIC_CODE_REVIEWERS_EXECUTION_MODE');
  });

  it('readEnv prioriza nome canônico sobre legado', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_ENGINE', 'opencode');
    setEnv('CURSOR_REVIEWER_ENGINE', 'cursor-sdk');
    assert.equal(readEnv('ENGINE', 'CURSOR_REVIEWER_ENGINE'), 'opencode');
  });

  it('readEnv faz fallback para legado quando canônico ausente', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY');
    setEnv('CURSOR_API_KEY', 'cursor_legacy');
    assert.equal(env.cursorApiKey(), 'cursor_legacy');
  });

  it('readEnv faz trim e ignora valor canônico só com espaços', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_ENGINE', '   ');
    setEnv('CURSOR_REVIEWER_ENGINE', 'opencode');
    assert.equal(readEnv('ENGINE', 'CURSOR_REVIEWER_ENGINE'), 'opencode');
  });

  it('readEnv retorna valor canônico trimado', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_MODEL', '  composer-2.5  ');
    assert.equal(readEnv('MODEL', 'CURSOR_REVIEWER_MODEL'), 'composer-2.5');
  });

  it('readEnv retorna undefined quando nenhuma chave está definida', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_REPO_URL', 'CURSOR_REVIEWER_REPO_URL');
    assert.equal(readEnv('REPO_URL', 'CURSOR_REVIEWER_REPO_URL'), undefined);
  });

  it('env.scoreMin lê AGENTIC_CODE_REVIEWERS_SCORE_MIN', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_SCORE_MIN', '4');
    clearKeys('SCORE_MIN');
    assert.equal(env.scoreMin(), '4');
  });

  it('env.scoreMin faz fallback para SCORE_MIN legado', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_SCORE_MIN');
    setEnv('SCORE_MIN', '7');
    assert.equal(env.scoreMin(), '7');
  });

  it('env.azureDevOpsPat faz fallback para AZURE_DEVOPS_EXT_PAT', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT');
    setEnv('AZURE_DEVOPS_EXT_PAT', 'pat_legacy');
    assert.equal(env.azureDevOpsPat(), 'pat_legacy');
  });

  it('env.opencodeUrl tenta OPENCODE_SERVER_URL como segundo legado', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_OPENCODE_URL', 'CURSOR_REVIEWER_OPENCODE_URL');
    setEnv('OPENCODE_SERVER_URL', 'http://127.0.0.1:4096');
    assert.equal(env.opencodeUrl(), 'http://127.0.0.1:4096');
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

  it('env.githubToken prioriza AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN', () => {
    setEnv('AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN', 'gh_canonical');
    setEnv('GITHUB_TOKEN', 'gh_legacy');
    setEnv('GH_TOKEN', 'gh_alt');
    assert.equal(env.githubToken(), 'gh_canonical');
  });

  it('env.githubToken faz fallback para GITHUB_TOKEN e GH_TOKEN', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN', 'GITHUB_TOKEN');
    setEnv('GH_TOKEN', 'gh_from_alt');
    assert.equal(env.githubToken(), 'gh_from_alt');

    setEnv('GITHUB_TOKEN', 'gh_from_github');
    assert.equal(env.githubToken(), 'gh_from_github');
  });

  it('env.executionMode faz fallback para REVIEWER_EXECUTION_MODE', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_EXECUTION_MODE');
    setEnv('REVIEWER_EXECUTION_MODE', 'sequential');
    assert.equal(env.executionMode(), 'sequential');
  });

  it('env.maxRounds faz fallback para CURSOR_REVIEWER_MAX_ROUNDS', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_MAX_ROUNDS');
    setEnv('CURSOR_REVIEWER_MAX_ROUNDS', '3');
    assert.equal(env.maxRounds(), '3');
  });

  it('env.targetBranch faz fallback para CURSOR_REVIEWER_TARGET_BRANCH', () => {
    clearKeys('AGENTIC_CODE_REVIEWERS_TARGET_BRANCH');
    setEnv('CURSOR_REVIEWER_TARGET_BRANCH', 'refs/heads/develop');
    assert.equal(env.targetBranch(), 'refs/heads/develop');
  });
});
