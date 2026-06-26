import type { ReviewerConfig } from '../config.js';
import type { EngineRunResult, ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
import { buildAgentPrompt, type PromptContext } from './prompt.js';

export type { EngineRunResult };

export async function runCodeReviewAgent(
  config: ReviewerConfig,
  context: PromptContext,
  engine: ExecutionEngine,
  logger: Logger,
): Promise<EngineRunResult> {
  const prompt = buildAgentPrompt(config, context);

  logger.info('Setting sources: project (harness do repositório)');

  return engine.run(
    config,
    {
      name: `${config.projectName} Cursor Reviewer`,
      prompt,
    },
    logger,
  );
}
