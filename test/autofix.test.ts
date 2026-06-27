import assert from 'node:assert/strict';
import { describe, it, mock, afterEach } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { applyReplacements, runAutoFixFlow } from '../src/orchestrator/autofix-runner.js';

describe('applyReplacements', () => {
  it('aplica substituição simples em arquivo', () => {
    const original = 'linha 1\nlinha 2\nlinha 3';
    const replacements = [
      {
        startLine: 2,
        endLine: 2,
        replacementContent: 'linha 2 corrigida',
      },
    ];
    const result = applyReplacements(original, replacements);
    assert.equal(result, 'linha 1\nlinha 2 corrigida\nlinha 3');
  });

  it('ordena substituições de baixo para cima corretamente', () => {
    const original = 'linha 1\nlinha 2\nlinha 3\nlinha 4';
    const replacements = [
      {
        startLine: 2,
        endLine: 2,
        replacementContent: 'linha 2 alterada',
      },
      {
        startLine: 4,
        endLine: 4,
        replacementContent: 'linha 4 alterada',
      },
    ];
    const result = applyReplacements(original, replacements);
    assert.equal(result, 'linha 1\nlinha 2 alterada\nlinha 3\nlinha 4 alterada');
  });

  it('preserva finais de linha CRLF', () => {
    const original = 'linha 1\r\nlinha 2\r\nlinha 3';
    const replacements = [
      {
        startLine: 2,
        endLine: 2,
        replacementContent: 'linha 2 corrigida',
      },
    ];
    const result = applyReplacements(original, replacements);
    assert.equal(result, 'linha 1\r\nlinha 2 corrigida\r\nlinha 3');
  });

  it('lança erro para limites fora do arquivo', () => {
    const original = 'linha 1\nlinha 2';
    const replacements = [
      {
        startLine: 3,
        endLine: 3,
        replacementContent: 'erro',
      },
    ];
    assert.throws(() => {
      applyReplacements(original, replacements);
    }, /Substituição fora dos limites/);
  });

  it('lança erro para substituições sobrepostas', () => {
    const original = 'linha 1\nlinha 2\nlinha 3\nlinha 4';
    const replacements = [
      { startLine: 1, endLine: 3, replacementContent: 'l1-3' },
      { startLine: 2, endLine: 4, replacementContent: 'l2-4' },
    ];
    assert.throws(() => {
      applyReplacements(original, replacements);
    }, /Replacements sobrepostos/);
  });
});

describe('runAutoFixFlow', () => {
  const dummyLogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    section: () => {},
  } as any;

  function setupTempWorkspace() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-test-'));
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-remote-'));
    fs.mkdirSync(path.join(tmpDir, 'skills'));
    fs.writeFileSync(path.join(tmpDir, 'skills', 'AUTO_FIX.md'), 'dummy prompt');
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'linha 1\nlinha 2\nlinha 3');
    
    // Configura repositório git para evitar falhas nos comandos git
    execSync('git init -b master', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git init --bare', { cwd: remoteDir, stdio: 'ignore' });
    execSync(`git remote add origin "${remoteDir}"`, { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.name "test"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git add .', { cwd: tmpDir, stdio: 'ignore' });
    execSync('git commit -m "initial"', { cwd: tmpDir, stdio: 'ignore' });
    
    return tmpDir;
  }

  it('não resolve threads quando replacements está vazio', async () => {
    const tmpDir = setupTempWorkspace();
    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true } as any;
    const reviewContext = {
      activeThreads: [{ filePath: 'file.txt', lineNumber: 1, summary: 'test issue', threadId: '1' }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 0),
    } as any;
    const engine = {
      run: async () => ({ fullText: '```json\n{"explanation":"ok","replacements":[]}\n```' }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 0);
  });

  it('dry-run não grava arquivo nem resolve threads na API', async () => {
    const tmpDir = setupTempWorkspace();
    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: true, autoFix: true } as any;
    const reviewContext = {
      activeThreads: [{ filePath: 'file.txt', lineNumber: 1, summary: 'test issue', threadId: '1' }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 0),
    } as any;
    const engine = {
      run: async () => ({ fullText: '```json\n{"explanation":"ok","replacements":[{"startLine":1,"endLine":1,"replacementContent":"fixed"}]}\n```' }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    const content = fs.readFileSync(path.join(tmpDir, 'file.txt'), 'utf8');
    assert.equal(content, 'linha 1\nlinha 2\nlinha 3', 'não deve gravar em disco no dry-run');
    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 0, 'não deve resolver threads via API no dry-run');
  });

  it('não resolve threads quando replacements é idempotente (sem alteração de conteúdo)', async () => {
    const tmpDir = setupTempWorkspace();
    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true } as any;
    const reviewContext = {
      activeThreads: [{ filePath: 'file.txt', lineNumber: 1, summary: 'test issue', threadId: '1' }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 0),
    } as any;
    const engine = {
      run: async () => ({ fullText: '```json\n{"explanation":"ok","replacements":[{"startLine":1,"endLine":1,"replacementContent":"linha 1"}]}\n```' }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 0);
  });

  it('com múltiplos arquivos, resolve apenas as threads dos arquivos alterados', async () => {
    const tmpDir = setupTempWorkspace();
    // Cria um segundo arquivo e comita para o git ficar limpo
    fs.writeFileSync(path.join(tmpDir, 'file2.txt'), 'linha 1\nlinha 2\nlinha 3');
    execSync('git add file2.txt && git commit -m "add file2"', { cwd: tmpDir, stdio: 'ignore' });

    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true } as any;
    const reviewContext = {
      activeThreads: [
        { filePath: 'file.txt', lineNumber: 1, summary: 'test issue 1', threadId: '1' },
        { filePath: 'file2.txt', lineNumber: 1, summary: 'test issue 2', threadId: '2' },
      ],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 1),
    } as any;
    const engine = {
      run: async (cfg: any, task: any) => {
        if (task.name.includes('file.txt')) {
          // Arquivo 1: alteração real
          return { fullText: '```json\n{"explanation":"ok","replacements":[{"startLine":1,"endLine":1,"replacementContent":"linha 1 alterada"}]}\n```' };
        } else {
          // Arquivo 2: sem alterações
          return { fullText: '```json\n{"explanation":"ok","replacements":[]}\n```' };
        }
      },
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    // Apenas a thread 1 de file.txt deve ser resolvida. A thread de file2.txt não deve ser incluída.
    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 1);
    const calls = provider.resolvePullRequestReviewThreads.mock.calls;
    const resolvedItemsArg = calls[0].arguments[2];
    assert.equal(resolvedItemsArg.length, 1);
    assert.equal(resolvedItemsArg[0].threadId, 1);
    assert.equal(resolvedItemsArg[0].fileName, 'file.txt');
  });
});
