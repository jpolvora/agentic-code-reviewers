import type { ReviewerConfig } from '../config.js';
import type { DiffOptions } from '../git/diff.js';
import { buildDiffPromptSection } from '../git/diff-prompt.js';
import type { ExecutionEngine, EngineRunResult } from '../engine/types.js';
import type { Logger } from '../logger.js';
import { runCodeReviewAgent } from '../agent/runner.js';
import type { PromptContext } from '../agent/prompt.js';
import { parseAgentReviewOutput } from '../parser/review-response.js';
import { chunkFilesByCount } from './chunk-diff.js';
import { mergeCodeReviewResponses, mergeReviews } from './merge-reviews.js';
import { runMetaReviewer } from './meta-reviewer.js';
import { getDiffPatch } from '../git/diff.js';
import { prefetchMcpObservations } from '../mcp/mcp-prompt.js';

export interface ParallelReviewOptions {
  parallelChunks: number;
  metaReviewer: boolean;
  filteredFiles: string[];
  diffRange: string;
  diffOptions: DiffOptions;
}

export async function runParallelReview(
  config: ReviewerConfig,
  baseContext: PromptContext,
  engine: ExecutionEngine,
  logger: Logger,
  options: ParallelReviewOptions,
): Promise<EngineRunResult> {
  const fileChunks = chunkFilesByCount(options.filteredFiles, options.parallelChunks);
  logger.info(`Parallel review: ${fileChunks.length} chunk(s), ${options.filteredFiles.length} file(s)`);

  const mcpObservations = config.mcpEnabled ? prefetchMcpObservations(config, baseContext) : undefined;

  const chunkResults = await Promise.all(
    fileChunks.map(async (files, index) => {
      const diffSection = buildDiffPromptSection(
        config.repoRoot,
        options.diffRange,
        files,
        options.diffOptions,
      );
      const chunkContext: PromptContext = {
        ...baseContext,
        diffSection,
        diffStats: {
          fileCount: files.length,
          files,
        },
        ...(mcpObservations !== undefined ? { mcpObservations } : {}),
      };

      logger.info(`Chunk ${index + 1}/${fileChunks.length}: ${files.length} file(s)`);
      return runCodeReviewAgent(config, chunkContext, engine, logger);
    }),
  );

  const parsedChunks = chunkResults.map((r) => parseAgentReviewOutput(r.fullText));
  let merged = mergeCodeReviewResponses(parsedChunks);

  if (options.metaReviewer && merged.reviews.length > 0) {
    const diffExcerpt = getDiffPatch(config.repoRoot, options.diffRange, {
      ...options.diffOptions,
      files: options.filteredFiles,
    });
    const filtered = await runMetaReviewer(config, engine, logger, merged.reviews, diffExcerpt);
    const originalCritical = merged.reviews.filter((r) => r.severity === 'critical');
    const metaCritical = filtered.filter((r) => r.severity === 'critical');
    const metaNonCritical = filtered.filter((r) => r.severity !== 'critical');
    merged = { ...merged, reviews: mergeReviews([originalCritical, metaCritical, metaNonCritical]) };
  }

  const fullText = JSON.stringify({
    reviews: merged.reviews,
    resolvedThreads: merged.resolvedThreads,
    reviewSummary: merged.reviewSummary,
  });

  const last = chunkResults[chunkResults.length - 1]!;
  return {
    sessionId: chunkResults.map((r) => r.sessionId).join('+'),
    runId: last.runId,
    status: chunkResults.every((r) => r.status !== 'failed') ? 'completed' : 'partial',
    fullText,
    metrics: last.metrics,
  };
}
