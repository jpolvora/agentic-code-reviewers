import { execFileSync } from 'node:child_process';
/** Normaliza ref git para nome curto de branch (ex.: `refs/heads/feat/x` → `feat/x`). */
export function toShortRef(branch) {
    const trimmed = branch.trim();
    if (trimmed.startsWith('refs/remotes/origin/')) {
        return trimmed.slice('refs/remotes/origin/'.length);
    }
    if (trimmed.startsWith('refs/heads/')) {
        return trimmed.slice('refs/heads/'.length);
    }
    return trimmed.replace(/^refs\/heads\//, '');
}
function remoteTrackingRef(shortBranch) {
    return `refs/remotes/origin/${shortBranch}`;
}
export function runGit(cwd, args) {
    return execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
    }).toString().trimEnd();
}
export function getCurrentBranch(cwd) {
    try {
        return runGit(cwd, ['branch', '--show-current']);
    }
    catch {
        return '';
    }
}
function refExists(cwd, ref) {
    try {
        runGit(cwd, ['rev-parse', '--verify', ref]);
        return true;
    }
    catch {
        return false;
    }
}
/** Resolve a ref local da branch alvo (ex.: master). Busca origin só se a ref local não existir. */
function resolveTargetRef(cwd, target, log) {
    const localHeadRef = `refs/heads/${target}`;
    if (refExists(cwd, target)) {
        return target;
    }
    if (refExists(cwd, localHeadRef)) {
        return localHeadRef;
    }
    const originRef = `origin/${target}`;
    const remoteRef = remoteTrackingRef(target);
    if (refExists(cwd, originRef)) {
        return originRef;
    }
    if (refExists(cwd, remoteRef)) {
        return remoteRef;
    }
    log(`Ref local '${target}' ausente — fetch mínimo de origin/${target}`);
    runGit(cwd, [
        'fetch',
        'origin',
        `refs/heads/${target}:${remoteRef}`,
        '--depth=1',
        '--no-tags',
    ]);
    return originRef;
}
/**
 * Prepara o workspace local para review: checkout na branch da PR e diff contra o alvo (master).
 * Não clona nem faz checkout de outro repositório — usa o projeto já presente no cwd.
 */
export function prepareLocalReviewWorkspace(cwd, sourceBranch, targetBranch, log) {
    const source = toShortRef(sourceBranch);
    const target = toShortRef(targetBranch);
    const current = getCurrentBranch(cwd);
    log(`Repositório: ${cwd}`);
    log(`Branch atual: ${current || '(detached)'}`);
    if (current === source) {
        // Local mode: on the source branch, use local HEAD
        log(`Local mode: on branch '${source}', using local HEAD directly.`);
        const targetRef = resolveTargetRef(cwd, target, log);
        const diffRange = `${targetRef}...HEAD`;
        const head = runGit(cwd, ['rev-parse', '--short', 'HEAD']);
        const base = runGit(cwd, ['rev-parse', '--short', targetRef]);
        log(`Diff: ${diffRange} (${base}..${head})`);
        return { sourceBranch: source, targetBranch: target, targetRef, diffRange, includeUncommitted: false };
    }
    // CI/remote mode: fetch both refs from origin (compatible with ADO detached HEAD)
    log(`CI mode: fetching refs origin/${target} and origin/${source}`);
    runGit(cwd, [
        'fetch',
        'origin',
        `refs/heads/${target}:${remoteTrackingRef(target)}`,
        '--no-tags',
    ]);
    runGit(cwd, [
        'fetch',
        'origin',
        `refs/heads/${source}:${remoteTrackingRef(source)}`,
        '--no-tags',
    ]);
    const targetRef = `origin/${target}`;
    const diffRange = `${targetRef}...origin/${source}`;
    const headShort = runGit(cwd, ['rev-parse', '--short', `origin/${source}`]);
    const baseShort = runGit(cwd, ['rev-parse', '--short', targetRef]);
    log(`Diff: ${diffRange} (${baseShort}..${headShort})`);
    return { sourceBranch: source, targetBranch: target, targetRef, diffRange, includeUncommitted: false };
}
/** Git pode retornar exit != 0 mesmo com stdout útil (ex.: `git diff --no-index`). */
function runGitOptional(cwd, args) {
    try {
        return runGit(cwd, args);
    }
    catch (error) {
        const err = error;
        if (err.stdout) {
            return err.stdout.toString().trimEnd();
        }
        return '';
    }
}
function splitNullDelimited(output) {
    if (!output) {
        return [];
    }
    return output.split('\0').filter((line) => line.trim().length > 0);
}
/** Une listas de paths git preservando ordem e deduplicando (case-sensitive, normaliza `\` → `/`). */
export function mergeUniquePaths(...lists) {
    const seen = new Set();
    const merged = [];
    for (const list of lists) {
        for (const file of list) {
            const key = file.replace(/\\/g, '/');
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            merged.push(file);
        }
    }
    return merged;
}
/**
 * Arquivos alterados no working tree vs HEAD: staged, unstaged e untracked (respeita .gitignore).
 * Usado por `--include-uncommitted` para incluir fixtures seed temporárias sem commit.
 */
export function getUncommittedFileNames(cwd) {
    const staged = splitNullDelimited(runGitOptional(cwd, ['diff', '--cached', '--name-only', '-z', '--diff-filter=AMR']));
    const unstaged = splitNullDelimited(runGitOptional(cwd, ['diff', '--name-only', '-z', '--diff-filter=AMR']));
    const untracked = splitNullDelimited(runGitOptional(cwd, ['ls-files', '--others', '--exclude-standard', '-z']));
    return mergeUniquePaths(staged, unstaged, untracked);
}
function getUntrackedFileNames(cwd) {
    return splitNullDelimited(runGitOptional(cwd, ['ls-files', '--others', '--exclude-standard', '-z']));
}
function getNullRef() {
    return process.platform === 'win32' ? 'NUL' : '/dev/null';
}
function getUntrackedFilePatches(cwd, files) {
    const nullRef = getNullRef();
    const patches = [];
    for (const file of files) {
        const patch = runGitOptional(cwd, ['diff', '--no-index', '--', nullRef, file]);
        if (patch) {
            patches.push(patch);
        }
    }
    return patches.join('\n');
}
export function pathMatchesAnyPattern(relativePath, patterns) {
    const normalizedPath = relativePath.replace(/\\/g, '/').replace(/^\//, '');
    for (const pattern of patterns) {
        const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\//, '');
        if (matchGlob(normalizedPath, normalizedPattern)) {
            return true;
        }
    }
    return false;
}
function matchGlob(path, pattern) {
    let regexStr = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    regexStr = regexStr.replace(/\*\*\//g, '__GLOBSTAR_SLASH__');
    regexStr = regexStr.replace(/\*\*/g, '__GLOBSTAR__');
    regexStr = regexStr.replace(/\*/g, '[^/]*');
    regexStr = regexStr.replace(/\?/g, '[^/]');
    regexStr = regexStr.replaceAll('__GLOBSTAR_SLASH__', '(?:.*/)?');
    regexStr = regexStr.replaceAll('__GLOBSTAR__', '.*');
    const regex = new RegExp('^' + regexStr + '$', 'i');
    return regex.test(path);
}
export function getChangedFileNames(cwd, diffRange) {
    const output = runGit(cwd, ['diff', '--name-only', '-z', '--diff-filter=AMR', diffRange]);
    if (!output) {
        return [];
    }
    return output.split('\0').filter((line) => line.trim().length > 0);
}
export function filterChangedFiles(allFiles, includePatterns, excludePatterns) {
    return allFiles.filter((file) => {
        if (excludePatterns.length > 0 && pathMatchesAnyPattern(file, excludePatterns)) {
            return false;
        }
        if (includePatterns.length > 0 && !pathMatchesAnyPattern(file, includePatterns)) {
            return false;
        }
        return true;
    });
}
export function getDiffBreakdown(cwd, diffRange, includePatterns, excludePatterns, options = {}) {
    const committedFiles = getChangedFileNames(cwd, diffRange);
    const allChangedFiles = options.includeUncommitted
        ? mergeUniquePaths(committedFiles, getUncommittedFileNames(cwd))
        : committedFiles;
    const filteredFiles = filterChangedFiles(allChangedFiles, includePatterns, excludePatterns);
    return {
        allChangedFiles,
        filteredFiles,
        fileCount: filteredFiles.length,
        files: filteredFiles,
    };
}
/** Formata tamanho do patch do diff em KB (1 casa decimal). */
export function formatDiffSizeKb(sizeBytes) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
}
function measurePatchBytes(cwd, args) {
    const patch = runGitOptional(cwd, args);
    return patch ? Buffer.byteLength(patch, 'utf8') : 0;
}
/** Tamanho do patch git por arquivo (sem imprimir conteúdo). */
export function getDiffFileSummaries(cwd, diffRange, options = {}) {
    const files = options.files ?? [];
    if (files.length === 0) {
        return [];
    }
    const untrackedKeys = new Set(options.includeUncommitted
        ? getUntrackedFileNames(cwd).map((file) => file.replace(/\\/g, '/'))
        : []);
    const nullRef = getNullRef();
    return files.map((file) => {
        let sizeBytes = measurePatchBytes(cwd, ['diff', '--diff-filter=AMR', diffRange, '--', file]);
        if (options.includeUncommitted) {
            sizeBytes += measurePatchBytes(cwd, ['diff', '--diff-filter=AMR', 'HEAD', '--', file]);
            if (untrackedKeys.has(file.replace(/\\/g, '/'))) {
                sizeBytes += measurePatchBytes(cwd, ['diff', '--no-index', '--', nullRef, file]);
            }
        }
        return { file, sizeBytes };
    });
}
/** Saída compacta de `git diff --stat` para debug no console. */
export function getDiffStat(cwd, diffRange, options = {}) {
    const parts = [];
    const pathArgs = buildPathArgs(options.files);
    try {
        const committed = runGit(cwd, ['diff', '--stat', '--diff-filter=AMR', diffRange, ...pathArgs]);
        if (committed) {
            parts.push(committed);
        }
    }
    catch {
        // diff vazio ou ref ausente
    }
    if (options.includeUncommitted) {
        const workingTree = runGitOptional(cwd, ['diff', '--stat', '--diff-filter=AMR', 'HEAD', ...pathArgs]);
        if (workingTree) {
            parts.push('--- working tree vs HEAD (staged + unstaged) ---');
            parts.push(workingTree);
        }
        const untracked = filterFilesByScope(getUntrackedFileNames(cwd), options.files);
        if (untracked.length > 0) {
            parts.push('--- untracked ---');
            for (const file of untracked) {
                parts.push(` ${file} | 0`);
            }
        }
    }
    return parts.join('\n');
}
/** Patch de um único arquivo elegível (committed + uncommitted quando aplicável). */
export function getFileDiffPatch(cwd, diffRange, file, options = {}) {
    const parts = [];
    const committed = runGitOptional(cwd, ['diff', '--diff-filter=AMR', diffRange, '--', file]);
    if (committed) {
        parts.push(committed);
    }
    if (options.includeUncommitted) {
        const workingTree = runGitOptional(cwd, ['diff', '--diff-filter=AMR', 'HEAD', '--', file]);
        if (workingTree) {
            parts.push(workingTree);
        }
        const normalized = file.replace(/\\/g, '/');
        const isUntracked = getUntrackedFileNames(cwd).some((f) => f.replace(/\\/g, '/') === normalized);
        if (isUntracked) {
            const untrackedPatch = getUntrackedFilePatches(cwd, [file]);
            if (untrackedPatch) {
                parts.push(untrackedPatch);
            }
        }
    }
    return parts.join('\n\n');
}
/** Patch completo de `git diff` (pode ser grande). */
export function getDiffPatch(cwd, diffRange, options = {}) {
    const parts = [];
    const pathArgs = buildPathArgs(options.files);
    try {
        const committed = runGit(cwd, ['diff', '--diff-filter=AMR', diffRange, ...pathArgs]);
        if (committed) {
            parts.push(committed);
        }
    }
    catch {
        // diff vazio ou ref ausente
    }
    if (options.includeUncommitted) {
        const workingTree = runGitOptional(cwd, ['diff', '--diff-filter=AMR', 'HEAD', ...pathArgs]);
        if (workingTree) {
            parts.push('--- working tree vs HEAD (staged + unstaged) ---');
            parts.push(workingTree);
        }
        const untrackedPatch = getUntrackedFilePatches(cwd, filterFilesByScope(getUntrackedFileNames(cwd), options.files));
        if (untrackedPatch) {
            parts.push(untrackedPatch);
        }
    }
    return parts.join('\n\n');
}
function buildPathArgs(files) {
    if (files === undefined) {
        return [];
    }
    if (files.length === 0) {
        return ['--', '__cursor_reviewer_no_files__'];
    }
    return ['--', ...files];
}
function filterFilesByScope(files, scope) {
    if (scope === undefined) {
        return files;
    }
    const allowed = new Set(scope.map((file) => file.replace(/\\/g, '/')));
    return files.filter((file) => allowed.has(file.replace(/\\/g, '/')));
}
/** Branch atual formatada como refs/heads/... (fallback para config). */
export function detectSourceBranchRef(cwd) {
    const current = getCurrentBranch(cwd);
    if (!current) {
        return '';
    }
    return current.startsWith('refs/heads/') ? current : `refs/heads/${current}`;
}
//# sourceMappingURL=diff.js.map