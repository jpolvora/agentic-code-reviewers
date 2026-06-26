import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildAgentPrompt } from '../src/agent/prompt.js';
import type { ReviewerConfig } from '../src/config.js';
import type { PromptContext } from '../src/agent/prompt.js';

function minimalConfig(skillPath: string, systemPromptPath: string): ReviewerConfig {
  return {
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
    includePatterns: ['**/*.cs'],
    excludePatterns: ['*.md'],
    skillPath,
    systemPromptPath,
    projectName: 'TestProject',
    maxRounds: 3,
    stack: 'ABP/Angular',
    stackPromptPath: null,
    stackSource: 'fallback',
  };
}

const emptyDiffSection = {
  mode: 'empty' as const,
  content: '',
  totalBytes: 0,
  includedFiles: 0,
  omittedFiles: 0,
};

const promptContext: PromptContext = {
  workItemContext: '',
  prDescriptionContext: '',
  existingReviewContext: '',
  rulesContext: '## Rules do projeto\n\n- `.cursor/rules/abp-custom-rules.mdc`',
  diffSection: emptyDiffSection,
  diffStats: { fileCount: 1, files: ['src/Foo.cs'] },
  gitContext: {
    sourceBranch: 'refs/heads/feature',
    targetBranch: 'refs/heads/master',
    diffRange: 'origin/master...origin/feature',
    includeUncommitted: false,
  },
};

describe('buildAgentPrompt', () => {
  it('monta prompt em camadas com diff, rules e sem duplicar schema JSON', () => {
    const runnerRoot = process.cwd().includes('cursor-reviewer')
      ? process.cwd()
      : `${process.cwd()}/scripts/cursor-reviewer`;
    const skillPath = `${runnerRoot}/skills/CODE_REVIEW.md`;
    const systemPromptPath = `${runnerRoot}/skills/SYSTEM_PROMPT.md`;
    const skillOnDisk = readFileSync(skillPath, 'utf8');
    const systemOnDisk = readFileSync(systemPromptPath, 'utf8');

    const prompt = buildAgentPrompt(minimalConfig(skillPath, systemPromptPath), promptContext);

    assert.ok(prompt.includes('Modo somente leitura (obrigatório'));
    assert.ok(prompt.includes('Contrato de saída (JSON)'));
    assert.ok(prompt.includes('Rules do projeto'));
    assert.ok(prompt.includes('# Harness do projeto'));
    assert.ok(prompt.includes(skillOnDisk));
    assert.ok(prompt.includes('git diff origin/master'));
    assert.ok(prompt.includes('### Fase 1 — Triagem'));
    assert.ok(prompt.includes('### Fase 2 — Investigação profunda'));

    const jsonSchemaOccurrences = prompt.split('```json').length - 1;
    assert.equal(jsonSchemaOccurrences, 1);

    assert.ok(prompt.startsWith(systemOnDisk.slice(0, 60)));
  });

  it('inclui Pull Request ID no contexto da execução', () => {
    const runnerRoot = process.cwd().includes('cursor-reviewer')
      ? process.cwd()
      : `${process.cwd()}/scripts/cursor-reviewer`;

    const config = {
      ...minimalConfig(`${runnerRoot}/skills/CODE_REVIEW.md`, `${runnerRoot}/skills/SYSTEM_PROMPT.md`),
      pullRequestId: 789,
      pullRequestIdSource: 'SYSTEM_PULLREQUEST_PULLREQUESTID',
    };

    const prompt = buildAgentPrompt(config, promptContext);

    assert.ok(prompt.includes('**Pull Request ID (Azure DevOps):** #789'));
    assert.ok(prompt.includes('SYSTEM_PULLREQUEST_PULLREQUESTID'));
    assert.ok(prompt.includes('não confunda o ID da PR com IDs de Work Items'));
  });

  it('inclui diff embutido e descrição da PR quando fornecidos', () => {
    const runnerRoot = process.cwd().includes('cursor-reviewer')
      ? process.cwd()
      : `${process.cwd()}/scripts/cursor-reviewer`;

    const ctx: PromptContext = {
      ...promptContext,
      prDescriptionContext: '## Pull Request (Azure DevOps)\n\n> **Pull Request ID:** #789\n\n**Título:** Equipamentos Florestais',
      diffSection: {
        mode: 'full',
        content: '```diff\n+added line\n```',
        totalBytes: 20,
        includedFiles: 1,
        omittedFiles: 0,
      },
    };

    const prompt = buildAgentPrompt(
      minimalConfig(`${runnerRoot}/skills/CODE_REVIEW.md`, `${runnerRoot}/skills/SYSTEM_PROMPT.md`),
      ctx,
    );

    assert.ok(prompt.includes('## Diff da PR (pré-carregado)'));
    assert.ok(prompt.includes('+added line'));
    assert.ok(prompt.includes('Equipamentos Florestais'));
    assert.ok(prompt.includes('Use o **diff pré-carregado**'));
  });

  it('inclui metadados da stack e arquivo de recomendação no prompt', () => {
    const runnerRoot = process.cwd().includes('cursor-reviewer')
      ? process.cwd()
      : `${process.cwd()}/scripts/cursor-reviewer`;

    const config = {
      ...minimalConfig(`${runnerRoot}/skills/CODE_REVIEW.md`, `${runnerRoot}/skills/SYSTEM_PROMPT.md`),
      stack: 'PHP/Laravel',
      stackPromptPath: `${runnerRoot}/skills/stacks/php-laravel.md`,
    };

    const prompt = buildAgentPrompt(config, promptContext);

    assert.ok(prompt.includes('- **Stack:** `PHP/Laravel`'));
    assert.ok(prompt.includes('# Recomendações Específicas da Stack (PHP/Laravel)'));
    assert.ok(prompt.includes('Problema de Query N+1'));
  });
});
