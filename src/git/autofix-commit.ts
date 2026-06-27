import { execSync, execFileSync } from 'node:child_process';
import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';

function ensureGitUser(config: ReviewerConfig, logger: Logger): void {
  try {
    execSync('git config user.name', { cwd: config.repoRoot, stdio: 'ignore' });
  } catch {
    logger.info('Configurando user.name temporário para o bot...');
    execSync('git config user.name "agentic-code-reviewers[bot]"', { cwd: config.repoRoot });
  }

  try {
    execSync('git config user.email', { cwd: config.repoRoot, stdio: 'ignore' });
  } catch {
    logger.info('Configurando user.email temporário para o bot...');
    execSync('git config user.email "agentic-code-reviewers-bot@users.noreply.github.com"', {
      cwd: config.repoRoot,
    });
  }
}

export function buildAutoFixCommitMessage(config: ReviewerConfig): string {
  if (config.pullRequestId > 0) {
    return `fix(review): resolve issues from review threads of PR #${config.pullRequestId}`;
  }
  return 'fix(review): apply auto-fixes for active review threads';
}

/** HEAD local à frente de origin/<branch> (commit pendente de push). */
export function isLocalAheadOfRemote(repoRoot: string): boolean {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    if (branch === 'HEAD') return false;
    execSync(`git fetch origin ${branch}`, { cwd: repoRoot, stdio: 'ignore' });
    const local = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
    const remote = execSync(`git rev-parse origin/${branch}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
    if (local === remote) return false;
    execSync(`git merge-base --is-ancestor ${remote} ${local}`, { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Stage + commit local; não faz push (gate cooperativo: push após resolução de threads). */
export async function commitAutoFixChanges(
  config: ReviewerConfig,
  logger: Logger,
  changedPaths: string[],
): Promise<boolean> {
  if (config.dryRun) {
    logger.info('[dry-run] Simulando commit local das alterações.');
    return true;
  }

  try {
    if (changedPaths.length === 0) {
      logger.info('Nenhum arquivo modificado para comitar.');
      return false;
    }

    logger.info('Adicionando arquivos modificados ao stage...');
    execFileSync('git', ['add', '--', ...changedPaths], { cwd: config.repoRoot, stdio: 'inherit' });

    logger.info('Verificando alterações no repositório...');
    const status = execSync('git status --porcelain', { cwd: config.repoRoot }).toString().trim();
    if (!status) {
      logger.info('Nenhuma alteração detectada no repositório local.');
      return false;
    }

    ensureGitUser(config, logger);

    const commitMsg = buildAutoFixCommitMessage(config);
    logger.info(`Criando commit local: ${commitMsg}`);
    execFileSync('git', ['commit', '-m', commitMsg], { cwd: config.repoRoot, stdio: 'inherit' });
    return true;
  } catch (error: unknown) {
    logger.error(
      `Falha ao criar commit local: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
}

/** Push após resolução bem-sucedida das threads (contrato COOPERATIVE_FIX.md). */
export async function pushAutoFixChanges(config: ReviewerConfig, logger: Logger): Promise<boolean> {
  if (config.dryRun) {
    logger.info('[dry-run] Simulando push das alterações.');
    return true;
  }

  try {
    logger.info('Fazendo push das alterações para o remoto...');
    execSync('git push origin HEAD', { cwd: config.repoRoot, stdio: 'inherit' });
    logger.info('Push concluído com sucesso.');
    return true;
  } catch (error: unknown) {
    logger.error(`Falha no push: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** @deprecated Use commitAutoFixChanges + pushAutoFixChanges (gate cooperativo). */
export async function runAutoFixCommit(
  config: ReviewerConfig,
  logger: Logger,
  changedPaths: string[],
): Promise<boolean> {
  const committed = await commitAutoFixChanges(config, logger, changedPaths);
  if (!committed) {
    return false;
  }
  return pushAutoFixChanges(config, logger);
}
