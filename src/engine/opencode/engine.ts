import type { ReviewerConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import { type EngineRunOptions, type EngineRunResult, type ExecutionEngine } from '../types.js';
import { runOpencodeStream } from './stream.js';

export class OpencodeEngine implements ExecutionEngine {
  readonly engineName = 'opencode' as const;

  async run(config: ReviewerConfig, options: EngineRunOptions, logger: Logger): Promise<EngineRunResult> {
    const result = await runOpencodeStream(
      config,
      {
        name: options.name,
        prompt: options.prompt,
        resumeSessionId: options.resumeSessionId,
      },
      logger,
    );

    return {
      sessionId: result.sessionId,
      runId: result.runId,
      status: result.status,
      fullText: result.fullText,
      metrics: result.metrics,
    };
  }
}
