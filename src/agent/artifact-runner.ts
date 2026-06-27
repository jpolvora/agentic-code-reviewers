import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReviewerConfig } from '../config.js';
import type { ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
import type { PromptContext } from './prompt.js';
import { buildExecutionContext } from './prompt.js';

export interface ArtifactOptions {
  commitMessage: boolean;
  prDescription: boolean;
}

function loadArtifactsSkill(runnerRoot: string): string {
  const path = resolve(runnerRoot, 'skills', 'GENERATE_ARTIFACTS.md');
  if (!existsSync(path)) {
    throw new Error(`GENERATE_ARTIFACTS.md not found: ${path}`);
  }
  return readFileSync(path, 'utf8');
}

function buildArtifactPrompt(
  config: ReviewerConfig,
  context: PromptContext,
  skillContent: string,
  artifactType: 'commit' | 'pr-description',
): string {
  const execution = buildExecutionContext(config, context);
  const diffContent =
    context.diffSection.mode !== 'empty'
      ? context.diffSection.content
      : '(diff vazio — use contexto disponível)';

  const instruction =
    artifactType === 'commit'
      ? 'Gere **somente** uma mensagem de commit no formato Conventional Commits (markdown).'
      : 'Gere **somente** uma descrição de PR com seções Why / How / Risks / Rollback plan (markdown).';

  return [
    skillContent,
    '',
    '---',
    '',
    instruction,
    '',
    ...execution,
    '',
    '## Diff',
    '',
    diffContent,
    '',
    context.prDescriptionContext ? `\n${context.prDescriptionContext}` : '',
    context.workItemContext ? `\n${context.workItemContext}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function runReviewArtifacts(
  config: ReviewerConfig,
  context: PromptContext,
  engine: ExecutionEngine,
  logger: Logger,
  options: ArtifactOptions,
): Promise<void> {
  const skill = loadArtifactsSkill(config.runnerRoot);

  if (options.commitMessage) {
    logger.section('Gerando commit message');
    const prompt = buildArtifactPrompt(config, context, skill, 'commit');
    const result = await engine.run(
      config,
      { name: `${config.projectName} Commit Message`, prompt },
      logger,
    );
    console.log('\n--- COMMIT MESSAGE ---\n');
    console.log(result.fullText.trim());
    console.log('\n--- END COMMIT MESSAGE ---\n');
  }

  if (options.prDescription) {
    logger.section('Gerando PR description');
    const prompt = buildArtifactPrompt(config, context, skill, 'pr-description');
    const result = await engine.run(
      config,
      { name: `${config.projectName} PR Description`, prompt },
      logger,
    );
    console.log('\n--- PR DESCRIPTION ---\n');
    console.log(result.fullText.trim());
    console.log('\n--- END PR DESCRIPTION ---\n');
  }
}
