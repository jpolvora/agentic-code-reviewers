import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';

/** Resolve build command: env override → `npm run build` when package.json has scripts.build → skip. */
export function resolveAutoFixBuildCommand(repoRoot: string, envCommand?: string): string | null {
  if (envCommand === '') return null;
  if (envCommand) return envCommand;

  const pkgPath = path.join(repoRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> };
    if (pkg.scripts?.build) return 'npm run build';
  } catch {
    return null;
  }
  return null;
}

/** Valida build após commit local; falha aborta resolução e push (gate cooperativo). */
export async function runAutoFixBuild(config: ReviewerConfig, logger: Logger): Promise<boolean> {
  if (config.dryRun) {
    logger.info('[dry-run] Simulando build de validação.');
    return true;
  }

  const command = config.autoFixBuildCommand;
  if (!command) {
    logger.info('Build de auto-fix ignorado (sem comando configurado ou script build ausente).');
    return true;
  }

  try {
    logger.info(`Executando build de validação: ${command}`);
    execSync(command, { cwd: config.repoRoot, stdio: 'inherit' });
    logger.info('Build concluído com sucesso.');
    return true;
  } catch (error: unknown) {
    logger.error(`Build falhou: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
