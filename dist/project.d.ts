export interface ProjectLayout {
    applicationDir: string | null;
    angularAppDir: string | null;
}
export interface ResolvedProject {
    runnerRoot: string;
    repoRoot: string;
    projectName: string;
    codeReviewSkillPath: string;
    systemPromptPath: string;
    layout: ProjectLayout;
    version: string;
}
export declare class ProjectValidationError extends Error {
    constructor(message: string);
}
/** Encerra o processo com mensagem explícita (fail-fast para CI/CD). */
export declare function failFast(message: string): never;
/** Localiza a raiz do pacote cursor-reviewer (scripts/cursor-reviewer). */
export declare function resolveRunnerRoot(fromModuleUrl: string): string;
export declare function detectProjectName(repoRoot: string): string;
export declare function detectProjectLayout(repoRoot: string): ProjectLayout;
/**
 * Valida harness do projeto alvo e retorna paths resolvidos.
 * Falha imediatamente se a estrutura ou as skills obrigatórias estiverem ausentes.
 */
export declare function resolveProject(fromModuleUrl: string, repoRootOverride?: string): ResolvedProject;
//# sourceMappingURL=project.d.ts.map