import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getRunnerRoot } from './paths.js';
/** Carrega `.env` do runner para subprocessos que não usam `tsx --env-file`. */
export function loadRunnerEnvFile() {
    const envPath = resolve(getRunnerRoot(), '.env');
    if (!existsSync(envPath)) {
        return;
    }
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const eq = trimmed.indexOf('=');
        if (eq <= 0) {
            continue;
        }
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) {
            process.env[key] = value;
        }
    }
}
//# sourceMappingURL=load-env.js.map