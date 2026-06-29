import assert from 'node:assert/strict';
import { describe, it, mock, afterEach } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { applyReplacements, computeUpdatedLineNumber, getAutoFixThreads, isThreadLineModified, runAutoFixFlow, testAutoFixSummaryAlreadyPosted } from '../src/orchestrator/autofix-runner.js';
import { AUTO_FIX_SUMMARY_MARKER } from '../src/git/markers.js';

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

  it('lança erro para linhas não-inteiras', () => {
    const original = 'linha 1\nlinha 2';
    const replacements = [
      {
        startLine: 1.9,
        endLine: 2.1,
        replacementContent: 'erro',
      },
    ];
    assert.throws(() => {
      applyReplacements(original, replacements);
    }, /Intervalo inválido/);
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

describe('isThreadLineModified', () => {
  it('retorna false quando a linha da thread está no intervalo mas o conteúdo não mudou', () => {
    const original = Array.from({ length: 5 }, (_, i) => `linha ${i + 1}`).join('\n');
    const replacements = [
      {
        startLine: 1,
        endLine: 5,
        replacementContent: 'linha 1 corrigida\nlinha 2\nlinha 3\nlinha 4\nlinha 5',
      },
    ];
    const updated = applyReplacements(original, replacements);

    assert.equal(isThreadLineModified(original, updated, 1, replacements), true);
    assert.equal(isThreadLineModified(original, updated, 5, replacements), false);
  });
});

describe('computeUpdatedLineNumber', () => {
  it('mapeia linha original para posição equivalente após replacement amplo', () => {
    const replacements = [{ startLine: 1, endLine: 10, replacementContent: 'a\nb\nc' }];
    assert.equal(computeUpdatedLineNumber(5, replacements), 3);
  });
});

describe('getAutoFixThreads', () => {
  it('retorna fileReviewThreads do contexto', () => {
    const threads = [{ threadId: '1', filePath: '/a.ts', lineNumber: 1 } as any];
    assert.deepEqual(getAutoFixThreads({ fileReviewThreads: threads } as any), threads);
  });
});

describe('testAutoFixSummaryAlreadyPosted', () => {
  const botTag = 'Agentic Code Reviewer cursor-sdk';
  const summaryBody = `${AUTO_FIX_SUMMARY_MARKER}\n\n## Auto-Fix Summary\n\nApplied 1 fix.`;

  it('returns true when stored comment matches after bot-tag and marker normalization', () => {
    const stored = `${botTag}\n\n${AUTO_FIX_SUMMARY_MARKER}\n\n## Auto-Fix Summary\n\nApplied 1 fix.`;
    const reviewContext = {
      allThreads: {
        value: [
          {
            id: 1,
            status: 'active',
            comments: [{ id: 1, parentCommentId: 0, content: stored, commentType: 1 }],
          },
        ],
      },
    } as any;

    assert.equal(testAutoFixSummaryAlreadyPosted(reviewContext, botTag, summaryBody), true);
  });

  it('returns false when no prior auto-fix summary exists', () => {
    const reviewContext = {
      allThreads: {
        value: [
          {
            id: 1,
            status: 'active',
            comments: [{ id: 1, parentCommentId: 0, content: `${botTag}\n\nOther comment`, commentType: 1 }],
          },
        ],
      },
    } as any;

    assert.equal(testAutoFixSummaryAlreadyPosted(reviewContext, botTag, summaryBody), false);
  });

  it('ignores file-anchored threads', () => {
    const stored = `${botTag}\n\n${AUTO_FIX_SUMMARY_MARKER}\n\n## Auto-Fix Summary\n\nApplied 1 fix.`;
    const reviewContext = {
      allThreads: {
        value: [
          {
            id: 1,
            status: 'active',
            threadContext: { filePath: '/src/foo.ts' },
            comments: [{ id: 1, parentCommentId: 0, content: stored, commentType: 1 }],
          },
        ],
      },
    } as any;

    assert.equal(testAutoFixSummaryAlreadyPosted(reviewContext, botTag, summaryBody), false);
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

  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length) {
      const dir = tempDirs.pop()!;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  function setupTempWorkspace() {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-test-'));
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-remote-'));
    tempDirs.push(tmpDir, remoteDir);
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

  function agentJson(payload: Record<string, unknown>): string {
    return `\`\`\`json\n${JSON.stringify(payload)}\n\`\`\``;
  }

  it('não resolve threads quando replacements está vazio', async () => {
    const tmpDir = setupTempWorkspace();
    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true } as any;
    const reviewContext = {
      fileReviewThreads: [{ filePath: '/file.txt', lineNumber: 1, summary: 'test issue', threadId: '1' }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 0),
    } as any;
    const engine = {
      run: async () => ({ fullText: agentJson({ replacements: [], resolvedThreads: [] }) }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 0);
  });

  it('encontra arquivo PascalCase usando filePath preservando case (regressão Linux)', async () => {
    const tmpDir = setupTempWorkspace();
    fs.mkdirSync(path.join(tmpDir, 'Controllers'), { recursive: true });
    const pascalFile = path.join(tmpDir, 'Controllers', 'AuditController.cs');
    fs.writeFileSync(pascalFile, 'linha 1\nlinha 2\nlinha 3');
    execSync('git add . && git commit -m "add pascal"', { cwd: tmpDir, stdio: 'ignore' });

    const config = {
      repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true,
      provider: 'github', organization: 'o', repositoryName: 'r', pullRequestId: 1,
      project: '', botTag: 'Agentic Code Reviewer test',
    } as any;
    const reviewContext = {
      fileReviewThreads: [{ filePath: '/Controllers/AuditController.cs', lineNumber: 1, summary: 'authz missing', threadId: '1', botCommentId: 9 }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 1),
      postPrComment: mock.fn(async () => true),
    } as any;
    const engine = {
      run: async () => ({
        fullText: agentJson({
          replacements: [{ startLine: 1, endLine: 1, replacementContent: 'linha 1 fix' }],
          resolvedThreads: [{ threadId: '1', explanation: 'Added authz check.' }],
        }),
      }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    const content = fs.readFileSync(pascalFile, 'utf8');
    assert.equal(content, 'linha 1 fix\nlinha 2\nlinha 3', 'arquivo PascalCase deve ser encontrado e alterado');
    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 1);
  });

  it('dry-run não grava arquivo nem resolve threads na API', async () => {
    const tmpDir = setupTempWorkspace();
    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: true, autoFix: true } as any;
    const reviewContext = {
      fileReviewThreads: [{ filePath: '/file.txt', lineNumber: 1, summary: 'test issue', threadId: '1' }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 0),
    } as any;
    const engine = {
      run: async () => ({
        fullText: agentJson({
          replacements: [{ startLine: 1, endLine: 1, replacementContent: 'fixed' }],
          resolvedThreads: [{ threadId: '1', explanation: 'Fixed validation on line 1.' }],
        }),
      }),
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
      fileReviewThreads: [{ filePath: '/file.txt', lineNumber: 1, summary: 'test issue', threadId: '1' }],
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

    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true, provider: 'github', organization: 'test-org', repositoryName: 'test-repo', pullRequestId: 1, project: '', botTag: 'Agentic Code Reviewer test' } as any;
    const reviewContext = {
      fileReviewThreads: [
        { filePath: '/file.txt', lineNumber: 1, summary: 'test issue 1', threadId: '1', botCommentId: 100 },
        { filePath: '/file2.txt', lineNumber: 1, summary: 'test issue 2', threadId: '2', botCommentId: 200 },
      ],
    } as any;
    const postPrComment = mock.fn(async () => true);
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 1),
      postPrComment,
    } as any;
    const engine = {
      run: async (cfg: any, task: any) => {
        if (task.name.includes('file.txt')) {
          // Arquivo 1: alteração real
          return {
            fullText: agentJson({
              replacements: [{ startLine: 1, endLine: 1, replacementContent: 'linha 1 alterada' }],
              resolvedThreads: [{ threadId: '1', explanation: 'Fixed issue on line 1.' }],
            }),
          };
        } else {
          return { fullText: agentJson({ replacements: [], resolvedThreads: [] }) };
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
    assert.equal(resolvedItemsArg[0].fileName, '/file.txt');
    // Verifica que o sumário foi publicado
    assert.equal(postPrComment.mock.callCount(), 1);
    const summaryBody = postPrComment.mock.calls[0].arguments[1] as string;
    assert.match(summaryBody, /auto-fix-summary/);
    assert.match(summaryBody, /file\.txt/);
    assert.match(summaryBody, /Fixed issue on line 1/);
  });

  it('resolve apenas threads listadas em resolvedThreads pelo agente', async () => {
    const tmpDir = setupTempWorkspace();
    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true, provider: 'github', organization: 'test-org', repositoryName: 'test-repo', pullRequestId: 1, project: '', botTag: 'Agentic Code Reviewer test' } as any;
    const reviewContext = {
      fileReviewThreads: [
        { filePath: '/file.txt', lineNumber: 1, summary: 'test issue 1', threadId: '1', botCommentId: 100 },
        { filePath: '/file.txt', lineNumber: 3, summary: 'test issue 2', threadId: '2', botCommentId: 200 },
      ],
    } as any;
    const postPrComment = mock.fn(async () => true);
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 1),
      postPrComment,
    } as any;
    const engine = {
      run: async () => ({
        fullText: agentJson({
          replacements: [{ startLine: 1, endLine: 1, replacementContent: 'linha 1 alterada' }],
          resolvedThreads: [{ threadId: '1', explanation: 'Corrigido apenas thread 1.' }],
        }),
      }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    // Apenas a thread 1 foi listada em resolvedThreads.
    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 1);
    const calls = provider.resolvePullRequestReviewThreads.mock.calls;
    const resolvedItemsArg = calls[0].arguments[2];
    assert.equal(resolvedItemsArg.length, 1);
    assert.equal(resolvedItemsArg[0].threadId, 1);
    assert.equal(resolvedItemsArg[0].lineNumber, 1);
    assert.equal(postPrComment.mock.callCount(), 1);
  });

  it('não fecha threads omitidas em resolvedThreads mesmo com replacement amplo', async () => {
    const tmpDir = setupTempWorkspace();
    const lines = ['linha 1', 'linha 2', 'linha 3', 'linha 4', 'linha 5'];
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), lines.join('\n'));
    execSync('git add file.txt && git commit -m "reset file" --amend --no-edit', { cwd: tmpDir, stdio: 'ignore' });

    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true, provider: 'github', organization: 'test-org', repositoryName: 'test-repo', pullRequestId: 1, project: '', botTag: 'Agentic Code Reviewer test' } as any;
    const reviewContext = {
      fileReviewThreads: [
        { filePath: '/file.txt', lineNumber: 1, summary: 'issue linha 1', threadId: '1', botCommentId: 100 },
        { filePath: '/file.txt', lineNumber: 5, summary: 'issue linha 5', threadId: '2', botCommentId: 200 },
      ],
    } as any;
    const postPrComment = mock.fn(async () => true);
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 1),
      postPrComment,
    } as any;
    const engine = {
      run: async () => ({
        fullText: agentJson({
          replacements: [
            {
              startLine: 1,
              endLine: 5,
              replacementContent: 'linha 1 corrigida\nlinha 2\nlinha 3\nlinha 4\nlinha 5',
            },
          ],
          resolvedThreads: [{ threadId: '1', explanation: 'Corrigido só o defeito da thread 1.' }],
        }),
      }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 1);
    const resolvedItemsArg = provider.resolvePullRequestReviewThreads.mock.calls[0].arguments[2];
    assert.equal(resolvedItemsArg.length, 1);
    assert.equal(resolvedItemsArg[0].threadId, 1);
    assert.equal(resolvedItemsArg[0].lineNumber, 1);
    assert.equal(postPrComment.mock.callCount(), 1);
  });

  it('não comita quando resolvedThreads está vazio', async () => {
    const tmpDir = setupTempWorkspace();
    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true } as any;
    const reviewContext = {
      fileReviewThreads: [{ filePath: '/file.txt', lineNumber: 3, summary: 'issue linha 3', threadId: '1' }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 0),
    } as any;
    const engine = {
      run: async () => ({
        fullText: agentJson({
          replacements: [{ startLine: 2, endLine: 2, replacementContent: 'linha 2 alterada' }],
          resolvedThreads: [],
        }),
      }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 0);
    const content = fs.readFileSync(path.join(tmpDir, 'file.txt'), 'utf8');
    assert.equal(content, 'linha 1\nlinha 2\nlinha 3');
  });

  it('recovery: publica commit pendente quando não há threads ativas (dual-engine)', async () => {
    const tmpDir = setupTempWorkspace();
    execSync('git push -u origin master', { cwd: tmpDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(tmpDir, 'file.txt'), 'linha 1\nlinha 2 alterada\nlinha 3');
    execSync('git add file.txt && git commit -m "pending from prior engine"', {
      cwd: tmpDir,
      stdio: 'ignore',
    });

    const remoteBefore = execSync('git ls-remote origin refs/heads/master', {
      cwd: tmpDir,
      encoding: 'utf8',
    })
      .trim()
      .split('\t')[0];

    const config = { repoRoot: tmpDir, runnerRoot: tmpDir, dryRun: false, autoFix: true } as any;
    const reviewContext = { fileReviewThreads: [] } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 0),
    } as any;
    const engine = {
      run: mock.fn(async () => {
        throw new Error('engine não deve rodar sem threads');
      }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    assert.equal(engine.run.mock.callCount(), 0);
    const remoteAfter = execSync('git ls-remote origin refs/heads/master', {
      cwd: tmpDir,
      encoding: 'utf8',
    })
      .trim()
      .split('\t')[0];
    assert.notEqual(remoteBefore, remoteAfter);
    const localHead = execSync('git rev-parse HEAD', { cwd: tmpDir, encoding: 'utf8' }).trim();
    assert.equal(localHead, remoteAfter);
  });

  it('falha quando push falha após resolução bem-sucedida', async () => {
    const tmpDir = setupTempWorkspace();
    execSync('git remote remove origin', { cwd: tmpDir, stdio: 'ignore' });

    const config = {
      repoRoot: tmpDir,
      runnerRoot: tmpDir,
      dryRun: false,
      autoFix: true,
      pullRequestId: 42,
      autoFixBuildCommand: null,
    } as any;
    const reviewContext = {
      fileReviewThreads: [{ filePath: '/file.txt', lineNumber: 1, summary: 'test issue', threadId: '1' }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 1),
    } as any;
    const engine = {
      run: async () => ({
        fullText: agentJson({
          replacements: [{ startLine: 1, endLine: 1, replacementContent: 'linha 1 alterada' }],
          resolvedThreads: [{ threadId: '1', explanation: 'Detalhe da correção aplicada.' }],
        }),
      }),
    } as any;

    await assert.rejects(
      () => runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger),
      /push falhou após resolução/,
    );
    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 1);
  });

  it('aborta resolução e push quando build falha após commit', async () => {
    const tmpDir = setupTempWorkspace();
    const remoteUrl = execSync('git remote get-url origin', { cwd: tmpDir, encoding: 'utf8' }).trim();
    const remoteHeadBefore = execSync('git rev-parse HEAD', { cwd: remoteUrl, encoding: 'utf8' }).trim();

    const config = {
      repoRoot: tmpDir,
      runnerRoot: tmpDir,
      dryRun: false,
      autoFix: true,
      pullRequestId: 77,
      autoFixBuildCommand: process.platform === 'win32' ? 'cmd /c exit 1' : 'false',
    } as any;
    const reviewContext = {
      fileReviewThreads: [{ filePath: '/file.txt', lineNumber: 1, summary: 'test issue', threadId: '1' }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 1),
    } as any;
    const engine = {
      run: async () => ({
        fullText: agentJson({
          replacements: [{ startLine: 1, endLine: 1, replacementContent: 'linha 1 alterada' }],
          resolvedThreads: [{ threadId: '1', explanation: 'Detalhe da correção aplicada.' }],
        }),
      }),
    } as any;

    await assert.rejects(
      () => runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger),
      /build falhou após commit local/,
    );

    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 0);
    const localLog = execSync('git log -1 --oneline', { cwd: tmpDir, encoding: 'utf8' });
    assert.match(localLog, /fix\(#77\): auto-fix issues from review threads/);
    const remoteHeadAfter = execSync('git rev-parse HEAD', { cwd: remoteUrl, encoding: 'utf8' }).trim();
    assert.equal(remoteHeadBefore, remoteHeadAfter, 'push não deve ocorrer quando build falha');
  });

  it('aborta push quando resolução de threads falha (gate cooperativo)', async () => {
    const tmpDir = setupTempWorkspace();
    const remoteUrl = execSync('git remote get-url origin', { cwd: tmpDir, encoding: 'utf8' }).trim();
    const remoteHeadBefore = execSync('git rev-parse HEAD', { cwd: remoteUrl, encoding: 'utf8' }).trim();

    const config = {
      repoRoot: tmpDir,
      runnerRoot: tmpDir,
      dryRun: false,
      autoFix: true,
      pullRequestId: 99,
    } as any;
    const reviewContext = {
      fileReviewThreads: [{ filePath: '/file.txt', lineNumber: 1, summary: 'test issue', threadId: '1' }],
    } as any;
    const provider = {
      resolvePullRequestReviewThreads: mock.fn(async () => 0),
    } as any;
    const engine = {
      run: async () => ({
        fullText: agentJson({
          replacements: [{ startLine: 1, endLine: 1, replacementContent: 'linha 1 alterada' }],
          resolvedThreads: [{ threadId: '1', explanation: 'Detalhe da correção aplicada.' }],
        }),
      }),
    } as any;

    await runAutoFixFlow(config, reviewContext, provider, engine, dummyLogger);

    assert.equal(provider.resolvePullRequestReviewThreads.mock.callCount(), 1);
    const localLog = execSync('git log -1 --oneline', { cwd: tmpDir, encoding: 'utf8' });
    assert.match(localLog, /fix\(#99\): auto-fix issues from review threads/);
    const remoteHeadAfter = execSync('git rev-parse HEAD', { cwd: remoteUrl, encoding: 'utf8' }).trim();
    assert.equal(remoteHeadBefore, remoteHeadAfter, 'push não deve ocorrer quando resolução falha');
  });
});
