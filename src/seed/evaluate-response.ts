import { readFileSync } from 'node:fs';
import { normalizeFilePath } from '../ado/utils.js';
import { parseAgentReviewOutput } from '../parser/review-response.js';
import type { CodeReviewItem } from '../ado/types.js';
import { EXPECTED_SCENARIOS_PATH } from './paths.js';

export interface SeedScenarioExpectation {
  id: string;
  required: boolean;
  layer: string;
  filePathSuffix: string;
  minScore: number;
  commentKeywords: string[];
  requiresSuggestedFix: boolean;
  skipReason?: string;
}

export interface SeedManifest {
  version: number;
  description: string;
  minimumRequired: number;
  scenarios: SeedScenarioExpectation[];
}

export interface ScenarioMatchResult {
  scenario: SeedScenarioExpectation;
  matched: boolean;
  review?: CodeReviewItem;
  reasons: string[];
}

export interface SeedEvaluationResult {
  manifest: SeedManifest;
  reviews: CodeReviewItem[];
  scenarioResults: ScenarioMatchResult[];
  requiredDetected: number;
  requiredTotal: number;
  optionalDetected: number;
  optionalTotal: number;
  passed: boolean;
  summary: string;
}

export function loadSeedManifest(path: string = EXPECTED_SCENARIOS_PATH): SeedManifest {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as SeedManifest;
  if (!Array.isArray(raw.scenarios) || raw.scenarios.length === 0) {
    throw new Error(`Manifest inválido: ${path}`);
  }
  return raw;
}

function normalizePathForMatch(path: string): string {
  return normalizeFilePath(path).replace(/\\/g, '/').toLowerCase();
}

function reviewMatchesScenario(review: CodeReviewItem, scenario: SeedScenarioExpectation): string[] {
  const reasons: string[] = [];
  const fileNorm = normalizePathForMatch(review.fileName);
  const suffix = scenario.filePathSuffix.replace(/\\/g, '/').toLowerCase();

  if (!fileNorm.includes(suffix)) {
    reasons.push(`fileName não contém "${scenario.filePathSuffix}"`);
  }

  if (review.lineNumber <= 0) {
    reasons.push('lineNumber deve ser > 0');
  }

  if (review.score == null || review.score < scenario.minScore) {
    reasons.push(`score ${review.score ?? 'n/a'} < ${scenario.minScore}`);
  }

  const text = `${review.comment} ${review.analysis ?? ''}`.toLowerCase();
  const keywordHit = scenario.commentKeywords.some((kw) => text.includes(kw.toLowerCase()));
  if (!keywordHit) {
    reasons.push(`nenhuma keyword encontrada: ${scenario.commentKeywords.join(', ')}`);
  }

  if (scenario.requiresSuggestedFix && !review.suggestedFix?.trim()) {
    reasons.push('suggestedFix ausente');
  }

  return reasons;
}

export function findReviewForScenario(
  reviews: CodeReviewItem[],
  scenario: SeedScenarioExpectation,
): { review?: CodeReviewItem; reasons: string[] } {
  let best: { review: CodeReviewItem; reasons: string[] } | undefined;

  for (const review of reviews) {
    const reasons = reviewMatchesScenario(review, scenario);
    if (reasons.length === 0) {
      return { review, reasons: [] };
    }
    if (!best || reasons.length < best.reasons.length) {
      best = { review, reasons };
    }
  }

  return { review: best?.review, reasons: best?.reasons ?? ['nenhum review no output'] };
}

export function evaluateSeedResponse(
  agentOutput: string,
  manifest: SeedManifest = loadSeedManifest(),
): SeedEvaluationResult {
  // O output no modo seed test é muitas vezes o console log completo do processo.
  // Procuramos o bloco JSON limpo do dry-run se existir.
  const dryRunMarker = 'DRY-RUN — JSON que seria publicado';
  const previewMarker = 'DRY-RUN — Preview das threads';
  let jsonSource = agentOutput;
  const markerIdx = agentOutput.indexOf(dryRunMarker);
  if (markerIdx !== -1) {
    const endIdx = agentOutput.indexOf(previewMarker, markerIdx);
    const sliceEnd = endIdx !== -1 ? endIdx : agentOutput.length;
    const braceIdx = agentOutput.indexOf('{', markerIdx);
    if (braceIdx !== -1 && braceIdx < sliceEnd) {
      jsonSource = agentOutput.substring(braceIdx, sliceEnd);
    }
  }

  const parsed = parseAgentReviewOutput(jsonSource);
  const reviews = parsed.reviews;
  const usedReviewIndexes = new Set<number>();

  const scenarioResults: ScenarioMatchResult[] = manifest.scenarios.map((scenario) => {
    let matchedReview: CodeReviewItem | undefined;
    let bestReasons: string[] = ['nenhum review disponível'];

    for (let i = 0; i < reviews.length; i++) {
      if (usedReviewIndexes.has(i)) {
        continue;
      }

      const reasons = reviewMatchesScenario(reviews[i], scenario);
      if (reasons.length === 0) {
        usedReviewIndexes.add(i);
        matchedReview = reviews[i];
        return {
          scenario,
          matched: true,
          review: matchedReview,
          reasons: [],
        };
      }

      if (bestReasons[0] === 'nenhum review disponível' || reasons.length < bestReasons.length) {
        bestReasons = reasons;
        matchedReview = reviews[i];
      }
    }

    return {
      scenario,
      matched: false,
      review: matchedReview,
      reasons: bestReasons,
    };
  });

  const required = scenarioResults.filter((r) => r.scenario.required);
  const optional = scenarioResults.filter((r) => !r.scenario.required);
  const requiredDetected = required.filter((r) => r.matched).length;
  const optionalDetected = optional.filter((r) => r.matched).length;

  const passed = requiredDetected >= manifest.minimumRequired;

  const lines = [
    `Reviews no output: ${reviews.length}`,
    `Obrigatórios detectados: ${requiredDetected}/${required.length} (mínimo: ${manifest.minimumRequired})`,
    `Opcionais detectados: ${optionalDetected}/${optional.length}`,
  ];

  for (const result of scenarioResults) {
    const status = result.matched ? 'OK' : result.scenario.required ? 'FALTA' : 'SKIP?';
    lines.push(`  [${status}] ${result.scenario.id} (${result.scenario.layer})`);
    if (!result.matched && result.reasons.length > 0) {
      lines.push(`         → ${result.reasons.join('; ')}`);
    }
    if (result.matched && result.review) {
      lines.push(
        `         → score=${result.review.score} line=${result.review.lineNumber} fix=${Boolean(result.review.suggestedFix?.trim())}`,
      );
    }
  }

  return {
    manifest,
    reviews,
    scenarioResults,
    requiredDetected,
    requiredTotal: required.length,
    optionalDetected,
    optionalTotal: optional.length,
    passed,
    summary: lines.join('\n'),
  };
}

export function evaluateSeedResponseFromFile(filePath: string): SeedEvaluationResult {
  const content = readFileSync(filePath, 'utf8');
  return evaluateSeedResponse(content);
}
