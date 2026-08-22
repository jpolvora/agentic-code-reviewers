import { existsSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSeedTargets, getRepoRoot } from './paths.js';
import { detectProjectLayout } from '../project.js';
export function uninstallSeedFixtures(log = console.log) {
    const targets = buildSeedTargets();
    for (const target of targets) {
        if (existsSync(target.repoPath)) {
            rmSync(target.repoPath, { force: true });
            log(`[seed:uninstall] removido ${target.repoPath}`);
        }
    }
    const dirs = new Set(targets.map((target) => dirname(target.repoPath)));
    for (const dir of dirs) {
        try {
            rmSync(dir, { recursive: true, force: true });
            log(`[seed:uninstall] diretório removido ${dir}`);
        }
        catch {
            // diretório não vazio ou inexistente — ignorar
        }
    }
}
export function listInstalledSeedPaths() {
    return buildSeedTargets().filter((t) => existsSync(t.repoPath)).map((t) => t.repoPath);
}
export function assertWorkspaceClean() {
    const installed = listInstalledSeedPaths();
    if (installed.length > 0) {
        throw new Error(`Arquivos seed ainda presentes no workspace (${installed.length}). Execute: npm run seed:uninstall\n` +
            installed.map((p) => `  - ${p}`).join('\n'));
    }
    const markerHits = findSeedMarkersInRepo();
    if (markerHits.length > 0) {
        throw new Error(`Marcador CURSOR-REVIEWER-SEED encontrado fora de fixtures:\n` +
            markerHits.map((p) => `  - ${p}`).join('\n'));
    }
}
function findSeedMarkersInRepo() {
    const repoRoot = getRepoRoot();
    const layout = detectProjectLayout(repoRoot);
    const suspects = [];
    if (layout.applicationDir) {
        suspects.push(`${layout.applicationDir}/CursorReviewerSeed`);
    }
    if (layout.angularAppDir) {
        suspects.push(`${layout.angularAppDir}/cursor-reviewer-seed`);
    }
    return suspects.filter((p) => existsSync(p));
}
function isDirectRun() {
    const entry = process.argv[1];
    if (!entry) {
        return false;
    }
    return import.meta.url === pathToFileURL(entry).href;
}
if (isDirectRun()) {
    uninstallSeedFixtures();
    console.log('[seed:uninstall] concluído.');
}
//# sourceMappingURL=uninstall-fixtures.js.map