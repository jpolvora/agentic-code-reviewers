import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildSeedTargets } from './paths.js';
export function installSeedFixtures(log = console.log) {
    const targets = buildSeedTargets();
    for (const target of targets) {
        if (!existsSync(target.fixturePath)) {
            throw new Error(`Fixture ausente: ${target.fixturePath}`);
        }
        mkdirSync(dirname(target.repoPath), { recursive: true });
        copyFileSync(target.fixturePath, target.repoPath);
        log(`[seed:install] ${target.id} → ${target.repoPath}`);
    }
}
function isDirectRun() {
    const entry = process.argv[1];
    if (!entry) {
        return false;
    }
    return import.meta.url === pathToFileURL(entry).href;
}
if (isDirectRun()) {
    installSeedFixtures();
    console.log('[seed:install] concluído.');
}
//# sourceMappingURL=install-fixtures.js.map