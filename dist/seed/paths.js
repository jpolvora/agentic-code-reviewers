import { resolve } from 'node:path';
import { failFast, resolveProject } from '../project.js';
const moduleUrl = import.meta.url;
export const FIXTURES_ROOT = resolve(resolveProject(moduleUrl).runnerRoot, 'fixtures/seed');
export const EXPECTED_SCENARIOS_PATH = resolve(FIXTURES_ROOT, 'expected-scenarios.json');
let cachedProject = resolveProject(moduleUrl);
export function getRunnerRoot() {
    return cachedProject.runnerRoot;
}
export function getRepoRoot() {
    return cachedProject.repoRoot;
}
export function checkSeedLayout(layout) {
    return !!(layout.applicationDir && layout.angularAppDir);
}
function assertSeedLayout(layout) {
    if (!layout.applicationDir) {
        failFast('Seed test requer camada Application ABP em src/*Application.\n' +
            `  Repositório: ${cachedProject.repoRoot}\n` +
            '  Nenhuma pasta *Application encontrada em src/.');
    }
    if (!layout.angularAppDir) {
        failFast('Seed test requer frontend Angular (ex.: angular/src/app).\n' +
            `  Repositório: ${cachedProject.repoRoot}\n` +
            '  Nenhum diretório de app Angular detectado.');
    }
}
export function buildSeedTargets() {
    cachedProject = resolveProject(moduleUrl);
    const layout = cachedProject.layout;
    if (!checkSeedLayout(layout)) {
        return [];
    }
    assertSeedLayout(layout);
    const applicationDir = layout.applicationDir;
    const angularAppDir = layout.angularAppDir;
    return [
        {
            id: 'backend',
            fixturePath: resolve(FIXTURES_ROOT, 'backend/CursorReviewerSeedAppService.cs'),
            repoPath: resolve(applicationDir, 'CursorReviewerSeed/CursorReviewerSeedAppService.cs'),
        },
        {
            id: 'frontend-ts',
            fixturePath: resolve(FIXTURES_ROOT, 'frontend/cursor-reviewer-seed.component.ts'),
            repoPath: resolve(angularAppDir, 'cursor-reviewer-seed/cursor-reviewer-seed.component.ts'),
        },
        {
            id: 'frontend-html',
            fixturePath: resolve(FIXTURES_ROOT, 'frontend/cursor-reviewer-seed.component.html'),
            repoPath: resolve(angularAppDir, 'cursor-reviewer-seed/cursor-reviewer-seed.component.html'),
        },
    ];
}
/** @deprecated Use buildSeedTargets(). */
export function getSeedTargets() {
    return buildSeedTargets();
}
//# sourceMappingURL=paths.js.map