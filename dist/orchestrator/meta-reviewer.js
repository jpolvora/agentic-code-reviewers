import { parseAgentReviewOutput } from '../parser/review-response.js';
import { reviewDedupKey } from '../ado/utils.js';
export async function runMetaReviewer(config, engine, logger, candidates, diffExcerpt) {
    if (candidates.length === 0) {
        return [];
    }
    const toReview = candidates;
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
    const result = await engine.run(config, { name: `${config.projectName} Meta-Reviewer`, prompt }, logger);
    const parsed = parseAgentReviewOutput(result.fullText);
    const allowed = new Set(candidates.map((r) => reviewDedupKey(r.fileName, r.lineNumber)));
    return (parsed.reviews ?? []).filter((r) => allowed.has(reviewDedupKey(r.fileName, r.lineNumber)));
}
//# sourceMappingURL=meta-reviewer.js.map