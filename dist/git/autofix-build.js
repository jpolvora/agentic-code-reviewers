import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
/** Resolve build command: env override → `npm test` → `npm run build` → skip. */
export function resolveAutoFixBuildCommand(repoRoot, envCommand) {
    if (envCommand === '')
        return null;
    if (envCommand)
        return envCommand;
    const pkgPath = path.join(repoRoot, 'package.json');
    if (!fs.existsSync(pkgPath))
        return null;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts?.test)
            return 'npm test';
        if (pkg.scripts?.build)
            return 'npm run build';
    }
    catch {
        return null;
    }
    return null;
}
/** Valida build após commit local; falha aborta resolução e push (gate cooperativo). */
export async function runAutoFixBuild(config, logger) {
    if (config.dryRun) {
        logger.info('[dry-run] Simulando build de validação.');
        return true;
    }
    const command = config.autoFixBuildCommand;
    if (!command) {
        logger.info('Build de auto-fix ignorado (sem comando configurado ou scripts test/build ausentes).');
        return true;
    }
    try {
        logger.info(`Executando build de validação: ${command}`);
        execSync(command, { cwd: config.repoRoot, stdio: 'inherit' });
        logger.info('Build concluído com sucesso.');
        return true;
    }
    catch (error) {
        logger.error(`Build falhou: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
//# sourceMappingURL=autofix-build.js.map