import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { writeFileSync, rmSync, symlinkSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig } from '../src/config.js';
import { buildAgentPrompt } from '../src/agent/prompt.js';
import type { ReviewerConfig } from '../src/config.js';

const ISOLATED_CI_ENV: Record<string, undefined> = {
  GITHUB_ACTIONS: undefined,
  GITHUB_REPOSITORY: undefined,
  GITHUB_REF: undefined,
  GITHUB_TOKEN: undefined,
  GH_TOKEN: undefined,
  TF_BUILD: undefined,
  SYSTEM_COLLECTIONURI: undefined,
  SYSTEM_PULLREQUEST_PULLREQUESTID: undefined,
  SYSTEM_ACCESSTOKEN: undefined,
  AZURE_DEVOPS_EXT_PAT: undefined,
  CURSOR_REVIEWER_STACK: undefined,
  CURSOR_REVIEWER_CUSTOM_PROMPT: undefined,
  CURSOR_REVIEWER_INCLUDE_PATTERNS: undefined,
};

function withEnv(env: Record<string, string | undefined>, action: () => void): void {
  const merged = { ...ISOLATED_CI_ENV, ...env };
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(merged)) {
    previous.set(key, process.env[key]);
    if (merged[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = merged[key];
    }
  }

  try {
    action();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

describe('Custom Stack and Prompts', () => {
  it('cai para o fallback se a stack é Custom e --custom-prompt / CURSOR_REVIEWER_CUSTOM_PROMPT não for definido', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig(['--dry-run', '--source-branch', 'refs/heads/feature', '--stack', 'custom']);
        // Cai para TypeScript (detectado por tsconfig.json e dependências typescript no package.json deste repositório)
        assert.equal(config.stack, 'TypeScript');
        assert.equal(config.customPromptContent, undefined);
      },
    );
  });

  it('carrega o prompt customizado diretamente como string se não for um arquivo existente', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'custom',
          '--custom-prompt',
          'Instruções de prompt customizadas para teste',
        ]);
        assert.equal(config.stack, 'Custom');
        assert.equal(config.customPromptContent, 'Instruções de prompt customizadas para teste');
        assert.deepEqual(config.includePatterns, ['**/*']);
      },
    );
  });

  it('carrega o prompt customizado a partir de um arquivo se o caminho existir', () => {
    const tempFile = resolve(process.cwd(), 'temp-custom-prompt-test.md');
    writeFileSync(tempFile, 'Conteúdo do arquivo temporário de prompt customizado', 'utf8');

    try {
      withEnv(
        {
          CURSOR_API_KEY: 'cursor_test',
        },
        () => {
          const config = loadConfig([
            '--dry-run',
            '--source-branch',
            'refs/heads/feature',
            '--stack',
            'custom',
            '--custom-prompt',
            tempFile,
          ]);
          assert.equal(config.stack, 'Custom');
          assert.equal(config.customPromptContent, 'Conteúdo do arquivo temporário de prompt customizado');
        },
      );
    } finally {
      rmSync(tempFile, { force: true });
    }
  });

  it('cai para o fallback se o parâmetro --custom-prompt parece um arquivo mas não existe', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'custom',
          '--custom-prompt',
          './inexistente-prompt-file.md',
        ]);
        assert.equal(config.stack, 'TypeScript');
        assert.equal(config.customPromptContent, undefined);
      },
    );
  });

  it('cai para o fallback se --custom-prompt é fornecido com stack diferente de Custom', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'ABP/Angular',
          '--custom-prompt',
          'Instruções de prompt',
        ]);
        assert.equal(config.stack, 'TypeScript');
        assert.equal(config.customPromptContent, undefined);
      },
    );
  });

  it('cai para o fallback se o conteúdo resolvido do prompt customizado for vazio', () => {
    const tempFile = resolve(process.cwd(), 'temp-empty-prompt-test.md');
    writeFileSync(tempFile, '   ', 'utf8'); // somente espaços

    try {
      withEnv(
        {
          CURSOR_API_KEY: 'cursor_test',
        },
        () => {
          const config = loadConfig([
            '--dry-run',
            '--source-branch',
            'refs/heads/feature',
            '--stack',
            'custom',
            '--custom-prompt',
            tempFile,
          ]);
          assert.equal(config.stack, 'TypeScript');
          assert.equal(config.customPromptContent, undefined);
        },
      );
    } finally {
      rmSync(tempFile, { force: true });
    }
  });

  it('respeita a variável de ambiente CURSOR_REVIEWER_CUSTOM_PROMPT', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_CUSTOM_PROMPT: 'Prompt da Env Var',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'custom',
        ]);
        assert.equal(config.stack, 'Custom');
        assert.equal(config.customPromptContent, 'Prompt da Env Var');
      },
    );
  });

  it('permite sobrescrever includePatterns via --include-patterns ou CURSOR_REVIEWER_INCLUDE_PATTERNS', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'custom',
          '--custom-prompt',
          'teste',
          '--include-patterns',
          '**/*.py,**/*.go',
        ]);
        assert.deepEqual(config.includePatterns, ['**/*.py', '**/*.go']);
      },
    );

    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
        CURSOR_REVIEWER_INCLUDE_PATTERNS: '**/*.java',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'custom',
          '--custom-prompt',
          'teste',
        ]);
        assert.deepEqual(config.includePatterns, ['**/*.java']);
      },
    );
  });

  it('usa padrões padrão da stack se includePatterns parsear para lista vazia', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'ABP/Angular',
          '--include-patterns',
          ', , ',
        ]);
        assert.deepEqual(config.includePatterns, ['**/*.cs', '**/*.ts', '**/*.html', '*.cs', '*.ts', '*.html']);
      },
    );
  });

  it('inclui o prompt customizado no resultado de buildAgentPrompt', () => {
    const config: ReviewerConfig = {
      repoRoot: process.cwd(),
      cursorApiKey: 'test',
      model: 'composer-2.5',
      botTag: '[Cursor Reviewer]',
      verbose: false,
      dryRun: true,
      includeUncommitted: false,
      seedTest: false,
      sourceBranch: 'refs/heads/feature',
      targetBranch: 'refs/heads/master',
      organization: '',
      project: '',
      repositoryName: '',
      pullRequestId: 0,
      pullRequestIdSource: '',
      adoAccessToken: '',
      includePatterns: ['**/*'],
      excludePatterns: [],
      skillPath: resolve(process.cwd(), 'skills/CODE_REVIEW.md'),
      systemPromptPath: resolve(process.cwd(), 'skills/SYSTEM_PROMPT.md'),
      projectName: 'TestProject',
      maxRounds: 3,
      stack: 'Custom',
      stackPromptPath: null,
      stackSource: 'cli',
      customPromptContent: 'Este é o prompt customizado secreto 12345',
    };

    const emptyDiffSection = {
      mode: 'empty' as const,
      content: '',
      totalBytes: 0,
      includedFiles: 0,
      omittedFiles: 0,
    };

    const promptContext = {
      workItemContext: '',
      prDescriptionContext: '',
      existingReviewContext: '',
      rulesContext: '',
      diffSection: emptyDiffSection,
      diffStats: { fileCount: 0, files: [] },
      gitContext: {
        sourceBranch: 'refs/heads/feature',
        targetBranch: 'refs/heads/master',
        diffRange: 'origin/master...origin/feature',
        includeUncommitted: false,
      },
    };

    const prompt = buildAgentPrompt(config, promptContext);
    assert.ok(prompt.includes('# Recomendações Específicas da Stack (Custom)'));
    assert.ok(prompt.includes('Este é o prompt customizado secreto 12345'));
  });

  it('carrega o prompt customizado inline com barra que não representa arquivo existente', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'custom',
          '--custom-prompt',
          'Revisar APIs HTTP/REST e GraphQL',
        ]);
        assert.equal(config.stack, 'Custom');
        assert.equal(config.customPromptContent, 'Revisar APIs HTTP/REST e GraphQL');
      },
    );
  });

  it('bloqueia e cai para o fallback se o caminho do prompt customizado tentar ler arquivos fora do repositório', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'custom',
          '--custom-prompt',
          '../outro-repo/.env',
        ]);
        assert.equal(config.stack, 'TypeScript');
        assert.equal(config.customPromptContent, undefined);
      },
    );
  });

  it('bloqueia leitura de prompt customizado via symlink apontando para arquivo fora do repositório', (t) => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'cursor-reviewer-symlink-test-'));
    const secretFile = join(outsideDir, 'secret.env');
    writeFileSync(secretFile, 'CURSOR_API_KEY=leaked-secret-via-symlink', 'utf8');
    const symlinkPath = resolve(process.cwd(), 'temp-symlink-prompt-test.md');

    try {
      symlinkSync(secretFile, symlinkPath);
    } catch {
      rmSync(outsideDir, { recursive: true, force: true });
      t.skip('symlinks não suportados neste ambiente');
      return;
    }

    try {
      withEnv(
        {
          CURSOR_API_KEY: 'cursor_test',
        },
        () => {
          const config = loadConfig([
            '--dry-run',
            '--source-branch',
            'refs/heads/feature',
            '--stack',
            'custom',
            '--custom-prompt',
            symlinkPath,
          ]);
          assert.equal(config.stack, 'TypeScript');
          assert.equal(config.customPromptContent, undefined);
        },
      );
    } finally {
      rmSync(symlinkPath, { force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it('aceita prompt customizado legítimo quando --repo-root aponta para um caminho com symlink (sem falso-positivo de escape)', (t) => {
    const realRepoRoot = resolve(process.cwd());
    const symlinkedRepoRoot = join(tmpdir(), `cursor-reviewer-repo-symlink-${Date.now()}`);
    const promptFileName = 'temp-in-repo-prompt-test.md';
    const promptPath = resolve(realRepoRoot, promptFileName);
    const promptBody = 'Revisar endpoints HTTP/REST com foco em autorização.';

    try {
      symlinkSync(realRepoRoot, symlinkedRepoRoot);
    } catch {
      rmSync(promptPath, { force: true });
      t.skip('symlinks não suportados neste ambiente');
      return;
    }

    writeFileSync(promptPath, promptBody, 'utf8');

    try {
      withEnv(
        {
          CURSOR_API_KEY: 'cursor_test',
        },
        () => {
          const config = loadConfig([
            '--dry-run',
            '--source-branch',
            'refs/heads/feature',
            '--repo-root',
            symlinkedRepoRoot,
            '--stack',
            'custom',
            '--custom-prompt',
            `./${promptFileName}`,
          ]);
          assert.equal(config.stack, 'Custom');
          assert.equal(config.customPromptContent, promptBody);
        },
      );
    } finally {
      rmSync(symlinkedRepoRoot, { force: true });
      rmSync(promptPath, { force: true });
    }
  });

  it('reseta includePatterns para o default da stack de fallback se a stack Custom falhar e cair no fallback', () => {
    withEnv(
      {
        CURSOR_API_KEY: 'cursor_test',
      },
      () => {
        const config = loadConfig([
          '--dry-run',
          '--source-branch',
          'refs/heads/feature',
          '--stack',
          'custom',
          '--custom-prompt',
          './inexistente-prompt-file.md',
          '--include-patterns',
          '**/*.py,**/*.go',
        ]);
        assert.equal(config.stack, 'TypeScript');
        assert.deepEqual(config.includePatterns, ['**/*.ts', '**/*.tsx', '**/*.json', '*.ts', '*.tsx', '*.json']);
      },
    );
  });
});
