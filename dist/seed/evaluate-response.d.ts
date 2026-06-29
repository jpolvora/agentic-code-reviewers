import type { CodeReviewItem } from '../ado/types.js';
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
export declare function loadSeedManifest(path?: string): SeedManifest;
export declare function findReviewForScenario(reviews: CodeReviewItem[], scenario: SeedScenarioExpectation): {
    review?: CodeReviewItem;
    reasons: string[];
};
export declare function evaluateSeedResponse(agentOutput: string, manifest?: SeedManifest): SeedEvaluationResult;
export declare function evaluateSeedResponseFromFile(filePath: string): SeedEvaluationResult;
//# sourceMappingURL=evaluate-response.d.ts.map