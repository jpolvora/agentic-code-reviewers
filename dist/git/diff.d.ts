/** Normaliza ref git para nome curto de branch (ex.: `refs/heads/feat/x` → `feat/x`). */
export declare function toShortRef(branch: string): string;
export interface LocalReviewGitContext {
    sourceBranch: string;
    targetBranch: string;
    targetRef: string;
    diffRange: string;
    includeUncommitted: boolean;
}
export interface DiffOptions {
    includeUncommitted?: boolean;
    files?: string[];
}
export declare function runGit(cwd: string, args: string[]): string;
export declare function getCurrentBranch(cwd: string): string;
/**
 * Prepara o workspace local para review: checkout na branch da PR e diff contra o alvo (master).
 * Não clona nem faz checkout de outro repositório — usa o projeto já presente no cwd.
 */
export declare function prepareLocalReviewWorkspace(cwd: string, sourceBranch: string, targetBranch: string, log: (msg: string) => void): LocalReviewGitContext;
/** Une listas de paths git preservando ordem e deduplicando (case-sensitive, normaliza `\` → `/`). */
export declare function mergeUniquePaths(...lists: string[][]): string[];
/**
 * Arquivos alterados no working tree vs HEAD: staged, unstaged e untracked (respeita .gitignore).
 * Usado por `--include-uncommitted` para incluir fixtures seed temporárias sem commit.
 */
export declare function getUncommittedFileNames(cwd: string): string[];
export declare function pathMatchesAnyPattern(relativePath: string, patterns: string[]): boolean;
export declare function getChangedFileNames(cwd: string, diffRange: string): string[];
export declare function filterChangedFiles(allFiles: string[], includePatterns: string[], excludePatterns: string[]): string[];
export interface DiffBreakdown {
    allChangedFiles: string[];
    filteredFiles: string[];
    fileCount: number;
    files: string[];
}
export declare function getDiffBreakdown(cwd: string, diffRange: string, includePatterns: string[], excludePatterns: string[], options?: DiffOptions): DiffBreakdown;
export interface DiffFileSummary {
    file: string;
    sizeBytes: number;
}
/** Formata tamanho do patch do diff em KB (1 casa decimal). */
export declare function formatDiffSizeKb(sizeBytes: number): string;
/** Tamanho do patch git por arquivo (sem imprimir conteúdo). */
export declare function getDiffFileSummaries(cwd: string, diffRange: string, options?: DiffOptions): DiffFileSummary[];
/** Saída compacta de `git diff --stat` para debug no console. */
export declare function getDiffStat(cwd: string, diffRange: string, options?: DiffOptions): string;
/** Patch de um único arquivo elegível (committed + uncommitted quando aplicável). */
export declare function getFileDiffPatch(cwd: string, diffRange: string, file: string, options?: DiffOptions): string;
/** Patch completo de `git diff` (pode ser grande). */
export declare function getDiffPatch(cwd: string, diffRange: string, options?: DiffOptions): string;
/** Branch atual formatada como refs/heads/... (fallback para config). */
export declare function detectSourceBranchRef(cwd: string): string;
//# sourceMappingURL=diff.d.ts.map