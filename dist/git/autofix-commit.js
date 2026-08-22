import { execSync, execFileSync } from 'node:child_process';
function ensureGitUser(config, logger) {
    try {
        execSync('git config user.name', { cwd: config.repoRoot, stdio: 'ignore' });
    }
    catch {
        logger.info('Configurando user.name temporário para o bot...');
        execSync('git config user.name "agentic-code-reviewers[bot]"', { cwd: config.repoRoot });
    }
    try {
        execSync('git config user.email', { cwd: config.repoRoot, stdio: 'ignore' });
    }
    catch {
        logger.info('Configurando user.email temporário para o bot...');
        execSync('git config user.email "agentic-code-reviewers-bot@users.noreply.github.com"', {
            cwd: config.repoRoot,
        });
    }
}
export function buildAutoFixCommitMessage(config, threadIds) {
    const threadList = threadIds && threadIds.length > 0 ? ` [${threadIds.join(', ')}]` : '';
    if (config.pullRequestId > 0) {
        return `fix(#${config.pullRequestId}): auto-fix issues from review threads${threadList}`;
    }
    return `fix: auto-fix issues from review threads${threadList}`;
}
/** HEAD local à frente de origin/<branch> (commit pendente de push). */
export function isLocalAheadOfRemote(repoRoot) {
    try {
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
        if (branch === 'HEAD')
            return false;
        execSync(`git fetch origin ${branch}`, { cwd: repoRoot, stdio: 'ignore' });
        const local = execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
        const remote = execSync(`git rev-parse origin/${branch}`, { cwd: repoRoot, encoding: 'utf8' }).trim();
        if (local === remote)
            return false;
        execSync(`git merge-base --is-ancestor ${remote} ${local}`, { cwd: repoRoot, stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
}
/** Stage + commit local; não faz push (gate cooperativo: push após resolução de threads). */
export async function commitAutoFixChanges(config, logger, changedPaths, threadIds) {
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
        const commitMsg = buildAutoFixCommitMessage(config, threadIds);
        logger.info(`Criando commit local: ${commitMsg}`);
        execFileSync('git', ['commit', '-m', commitMsg], { cwd: config.repoRoot, stdio: 'inherit' });
        return true;
    }
    catch (error) {
        logger.error(`Falha ao criar commit local: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
/** Push após resolução bem-sucedida das threads (contrato COOPERATIVE_FIX.md). */
export async function pushAutoFixChanges(config, logger) {
    if (config.dryRun) {
        logger.info('[dry-run] Simulando push das alterações.');
        return true;
    }
    try {
        logger.info('Fazendo push das alterações para o remoto...');
        execSync('git push origin HEAD', { cwd: config.repoRoot, stdio: 'inherit' });
        logger.info('Push concluído com sucesso.');
        return true;
    }
    catch (error) {
        logger.error(`Falha no push: ${error instanceof Error ? error.message : String(error)}`);
        return false;
    }
}
/** @deprecated Use commitAutoFixChanges + pushAutoFixChanges (gate cooperativo). */
export async function runAutoFixCommit(config, logger, changedPaths) {
    const committed = await commitAutoFixChanges(config, logger, changedPaths);
    if (!committed) {
        return false;
    }
    return pushAutoFixChanges(config, logger);
}
//# sourceMappingURL=autofix-commit.js.map