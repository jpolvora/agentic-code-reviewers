import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ENV, env } from '../env.js';
import { evaluateSeedResponse, evaluateSeedResponseFromFile } from './evaluate-response.js';
import { installSeedFixtures } from './install-fixtures.js';
import { loadRunnerEnvFile } from './load-env.js';
import { getRunnerRoot } from './paths.js';
import { uninstallSeedFixtures } from './uninstall-fixtures.js';
function parseArgs(argv) {
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--keep-seeds') {
            options.keepSeeds = true;
        }
        else if (arg === '--skip-agent') {
            options.skipAgent = true;
        }
        else if (arg === '--evaluate-only' && argv[i + 1]) {
            options.evaluateOnly = argv[++i];
        }
        else if (arg === '--output' && argv[i + 1]) {
            options.outputFile = argv[++i];
        }
    }
    return options;
}
function runDryRunCapture(outputPath) {
    const runnerRoot = getRunnerRoot();
    const command = 'npm run review -- --dry-run --include-uncommitted --seed-test';
    let output = '';
    try {
        output = execSync(command, {
            cwd: runnerRoot,
            encoding: 'utf8',
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    }
    catch (error) {
        const err = error;
        output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
        if (!output.trim()) {
            throw error;
        }
        const exitCode = err.status ?? '?';
        console.warn(`[test:seed] dry-run terminou com exit ${exitCode} (erro de execução — verifique logs acima).`);
    }
    writeFileSync(outputPath, output, 'utf8');
    console.log(`[test:seed] dry-run gravado em ${outputPath}`);
}
async function main() {
    loadRunnerEnvFile();
    const options = parseArgs(process.argv.slice(2));
    const runnerRoot = getRunnerRoot();
    const defaultOutput = resolve(runnerRoot, 'output.seed-test.tmp.txt');
    let evaluationSource;
    let installed = false;
    try {
        if (options.evaluateOnly) {
            console.log(`[test:seed] avaliando output existente: ${options.evaluateOnly}`);
            const result = evaluateSeedResponseFromFile(options.evaluateOnly);
            console.log('\n' + result.summary);
            process.exit(result.passed ? 0 : 1);
        }
        console.log('[test:seed] instalando fixtures...');
        installSeedFixtures();
        installed = true;
        const outputPath = options.outputFile ?? defaultOutput;
        if (!options.skipAgent) {
            if (!env.cursorApiKey()?.trim()) {
                throw new Error(`${ENV.CURSOR_API_KEY} ausente. npm run test:seed exige API key para dry-run com fixtures em disco.`);
            }
            console.log('[test:seed] executando dry-run do cursor-reviewer...');
            runDryRunCapture(outputPath);
            evaluationSource = readFileSync(outputPath, 'utf8');
        }
        if (!evaluationSource && existsSync(outputPath)) {
            evaluationSource = readFileSync(outputPath, 'utf8');
        }
        if (!evaluationSource) {
            throw new Error('Nenhum output disponível para avaliação.');
        }
        const result = evaluateSeedResponse(evaluationSource);
        console.log('\n=== Avaliação seed test ===\n' + result.summary);
        if (!result.passed) {
            console.error('\n[test:seed] FALHA — cenários obrigatórios insuficientes.');
            process.exitCode = 1;
        }
        else {
            console.log('\n[test:seed] SUCESSO — detecção mínima atendida.');
        }
    }
    finally {
        if (installed && !options.keepSeeds) {
            console.log('[test:seed] removendo fixtures do workspace...');
            uninstallSeedFixtures();
        }
        else if (installed && options.keepSeeds) {
            console.log('[test:seed] --keep-seeds: fixtures permanecem no workspace.');
        }
    }
}
main().catch((error) => {
    console.error(`[test:seed] erro: ${String(error)}`);
    process.exit(1);
});
//# sourceMappingURL=run-seed-test.js.map