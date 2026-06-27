import { execSync, execFileSync } from 'node:child_process';
import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';

export async function runAutoFixCommit(config: ReviewerConfig, logger: Logger, changedPaths: string[]): Promise<boolean> {
  if (config.dryRun) {
    logger.info('[dry-run] Simulando commit e push das alterações.');
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

    // Configura usuário temporário se não houver configuração global/local
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
      execSync('git config user.email "agentic-code-reviewers-bot@users.noreply.github.com"', { cwd: config.repoRoot });
    }

    logger.info('Criando commit consolidando as correções...');
    const commitMsg = 'style(agent): apply auto-fixes for active review threads';
    execSync(`git commit -m "${commitMsg}"`, { cwd: config.repoRoot, stdio: 'inherit' });

    logger.info('Fazendo push das alterações para o remoto...');
    execSync('git push origin HEAD', { cwd: config.repoRoot, stdio: 'inherit' });
    logger.info('Push concluído com sucesso.');
    return true;
  } catch (error: any) {
    logger.error(`Falha ao consolidar alterações no Git: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
