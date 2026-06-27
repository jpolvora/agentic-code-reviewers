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

  logger.info(`Score mínimo para threads (prompt + gate): ${config.scoreMin}`);

  if (config.engine === 'opencode') {
    logger.info('Harness do repositório: prompt do runner + instructions OpenCode (servidor embutido)');
  } else {
    logger.info('Harness do repositório: settingSources project (Cursor SDK)');
  }

  return engine.run(
    config,
    {
      name: `${config.projectName} Cursor Reviewer`,
      prompt,
    },
    logger,
  );
}
