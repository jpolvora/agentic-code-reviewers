import type { ReviewerConfig } from '../config.js';
import type { ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
import { parseAgentReviewOutput } from '../parser/review-response.js';
import type { CodeReviewItem } from '../ado/types.js';

export async function runMetaReviewer(
  config: ReviewerConfig,
  engine: ExecutionEngine,
  logger: Logger,
  candidates: CodeReviewItem[],
  diffExcerpt: string,
): Promise<CodeReviewItem[]> {
  if (candidates.length === 0) {
    return [];
  }

  const criticalOnly = candidates.filter((r) => r.severity === 'critical');
  const toReview = criticalOnly.length > 0 ? criticalOnly : candidates;

  const prompt = [
    '# Meta-Reviewer — síntese e filtro',
    '',
    'Você recebe candidatos de múltiplos agentes paralelos. Descarte duplicatas óbvias e falsos positivos.',
    'Mantenha apenas achados com evidência sólida. Responda **somente** JSON:',
    '',
    '```json',
    '{ "reviews": [ /* subset filtrado */ ], "resolvedThreads": [], "reviewSummary": "" }',
    '```',
    '',
    '## Diff (excerpt)',
    '',
    diffExcerpt.slice(0, 30_000),
    '',
    '## Candidatos',
    '',
    JSON.stringify({ reviews: toReview }, null, 2),
  ].join('\n');

  logger.info(`Meta-reviewer: filtrando ${toReview.length} candidato(s)...`);

  const result = await engine.run(
    config,
    { name: `${config.projectName} Meta-Reviewer`, prompt },
    logger,
  );

  const parsed = parseAgentReviewOutput(result.fullText);
  return parsed.reviews ?? [];
}
