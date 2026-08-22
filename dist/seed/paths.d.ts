import { type ProjectLayout } from '../project.js';
export declare const FIXTURES_ROOT: string;
export interface SeedTarget {
    id: string;
    fixturePath: string;
    repoPath: string;
}
export declare const EXPECTED_SCENARIOS_PATH: string;
export declare function getRunnerRoot(): string;
export declare function getRepoRoot(): string;
export declare function checkSeedLayout(layout: ProjectLayout): boolean;
export declare function buildSeedTargets(): SeedTarget[];
/** @deprecated Use buildSeedTargets(). */
export declare function getSeedTargets(): SeedTarget[];
//# sourceMappingURL=paths.d.ts.map