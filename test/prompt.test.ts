import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { buildAgentPrompt } from '../src/agent/prompt.js';
import type { ReviewerConfig } from '../src/config.js';
import type { PromptContext } from '../src/agent/prompt.js';
import { resolveRunnerRoot } from '../src/project.js';

const runnerRoot = resolveRunnerRoot(import.meta.url);

function minimalConfig(skillPath: string, systemPromptPath: string): ReviewerConfig {
  return {
    repoRoot: process.cwd(),
    runnerRoot,
    cursorApiKey: 'test',
    engine: 'cursor-sdk',
    model: 'composer-2.5',
    botTag: 'Agentic Code Reviewer cursor-sdk',
    verbose: false,
    dryRun: true,
    includeUncommitted: false,
    seedTest: false,
    sourceBranch: 'refs/heads/feature',
    targetBranch: 'refs/heads/master',
    provider: 'azuredevops',
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
    version: '0.0.0-test',
    maxRounds: 3,
    scoreMin: 6,
    stack: 'ABP/Angular',
    stackPromptPath: null,
    stackSource: 'fallback',
    safeOutputs: true,
    requireDiffLine: true,
    maxCommentChars: 8000,
    protectedPatterns: [],
    promptModules: [],
    mcpEnabled: false,
    mcpTools: [],
    mcpLintCmd: '',
    mcpTestCmd: '',
    parallelChunks: 1,
    metaReviewer: false,
    generateCommitMessage: false,
    generatePrDescription: false,
    artifactsOnly: false,
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
    const skillPath = `${runnerRoot}/skills/CODE_REVIEW.md`;
    const systemPromptPath = `${runnerRoot}/skills/SYSTEM_PROMPT.md`;
    const skillOnDisk = readFileSync(skillPath, 'utf8');
    const systemOnDisk = readFileSync(systemPromptPath, 'utf8');

    const prompt = buildAgentPrompt(minimalConfig(skillPath, systemPromptPath), promptContext);

    assert.ok(prompt.includes('Read-Only Mode (mandatory'));
    assert.ok(prompt.includes('Output Contract (JSON)'));
    assert.ok(prompt.includes('Project Rules'));
    assert.ok(prompt.includes('# Project Harness'));
    assert.ok(prompt.includes(skillOnDisk));
    assert.ok(prompt.includes('git diff origin/master'));
    assert.ok(prompt.includes('### Phase 1 — Triage'));
    assert.ok(prompt.includes('### Phase 2 — Deep Investigation'));

    const jsonSchemaOccurrences = prompt.split('```json').length - 1;
    assert.equal(jsonSchemaOccurrences, 1);

    assert.ok(prompt.startsWith(systemOnDisk.slice(0, 60)));
  });

  it('inclui Pull Request ID no contexto da execução', () => {
    const config = {
      ...minimalConfig(`${runnerRoot}/skills/CODE_REVIEW.md`, `${runnerRoot}/skills/SYSTEM_PROMPT.md`),
      pullRequestId: 789,
      pullRequestIdSource: 'SYSTEM_PULLREQUEST_PULLREQUESTID',
    };

    const prompt = buildAgentPrompt(config, promptContext);

    assert.ok(prompt.includes('**Pull Request ID (Azure DevOps):** #789'));
    assert.ok(prompt.includes('SYSTEM_PULLREQUEST_PULLREQUESTID'));
    assert.ok(prompt.includes('do not confuse the PR ID with linked Work Item IDs'));
  });

  it('inclui diff embutido e descrição da PR quando fornecidos', () => {
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

    assert.ok(prompt.includes('## PR Diff (pre-loaded)'));
    assert.ok(prompt.includes('+added line'));
    assert.ok(prompt.includes('Equipamentos Florestais'));
    assert.ok(prompt.includes('Use the **pre-loaded diff**'));
  });

  it('inclui metadados da stack e arquivo de recomendação no prompt', () => {
    const config = {
      ...minimalConfig(`${runnerRoot}/skills/CODE_REVIEW.md`, `${runnerRoot}/skills/SYSTEM_PROMPT.md`),
      stack: 'PHP/Laravel',
      stackPromptPath: `${runnerRoot}/skills/stacks/php-laravel.md`,
    };

    const prompt = buildAgentPrompt(config, promptContext);

    assert.ok(prompt.includes('- **Stack:** `PHP/Laravel`'));
    assert.ok(prompt.includes('# Specific Stack Recommendations (PHP/Laravel)'));
    assert.ok(prompt.includes('N+1 Query Problem'));
  });

  it('injeta scoreMin no contexto da execução e nas fases do workflow', () => {
    const config = {
      ...minimalConfig(`${runnerRoot}/skills/CODE_REVIEW.md`, `${runnerRoot}/skills/SYSTEM_PROMPT.md`),
      scoreMin: 4,
    };

    const prompt = buildAgentPrompt(config, promptContext);

    assert.ok(prompt.includes('Minimum score for threads'));
    assert.ok(prompt.includes('**4**'));
    assert.ok(prompt.includes('scoreMin = 4'));
    assert.ok(prompt.includes('score < 4 → omit'));
    assert.ok(prompt.includes('score ≥ 4'));
  });
});
