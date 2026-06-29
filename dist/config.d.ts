import type { ReviewerEngineName } from './engine/types.js';
import { ProjectValidationError } from './project.js';
export interface StackConfig {
    name: string;
    includePatterns: string[];
    promptFileName: string;
}
export declare const STACKS: Record<string, StackConfig>;
export declare function getStackConfig(stackName: string): StackConfig | undefined;
export declare function detectStack(repoRoot: string): string | undefined;
export interface ReviewerConfig {
    repoRoot: string;
    runnerRoot: string;
    cursorApiKey: string;
    /** Engine de execução LLM (default: cursor-sdk). */
    engine: ReviewerEngineName;
    model: string;
    /** Tag nos comentários — derivada da engine (`buildBotTag`). */
    botTag: string;
    verbose: boolean;
    dryRun: boolean;
    includeUncommitted: boolean;
    seedTest: boolean;
    sourceBranch: string;
    targetBranch: string;
    provider: 'azuredevops' | 'github';
    organization: string;
    project: string;
    repositoryName: string;
    pullRequestId: number;
    /** Origem do ID da PR: `--pr-id`, `SYSTEM_PULLREQUEST_PULLREQUESTID`, etc. */
    pullRequestIdSource: string;
    adoAccessToken: string;
    includePatterns: string[];
    excludePatterns: string[];
    skillPath: string;
    systemPromptPath: string;
    projectName: string;
    version: string;
    /** Orçamento de rodadas fix→review antes de escalar para revisão humana (0 desabilita). */
    maxRounds: number;
    /** Score mínimo (inclusive) para publicar issue como thread na PR. */
    scoreMin: number;
    stack: string;
    stackPromptPath: string | null;
    stackSource: 'cli' | 'env' | 'detected' | 'fallback';
    customPromptContent?: string;
    /** Safe Outputs gate — deterministic post-LLM validation. */
    safeOutputs: boolean;
    requireDiffLine: boolean;
    maxCommentChars: number;
    protectedPatterns: string[];
    /** Task-specific prompt modules (auto or forced via env). */
    promptModules: string[];
    /** MCP review tools (read-only context gathering). */
    mcpEnabled: boolean;
    mcpTools: string[];
    mcpLintCmd: string;
    mcpTestCmd: string;
    /** In-process parallel chunk count (1 = single agent). */
    parallelChunks: number;
    metaReviewer: boolean;
    /** Artifact generation modes (stdout only). */
    generateCommitMessage: boolean;
    generatePrDescription: boolean;
    artifactsOnly: boolean;
    autoFix: boolean;
    /** Comando de build pós-commit no auto-fix; null = ignorar (sem script ou env vazio). */
    autoFixBuildCommand: string | null;
}
export interface CliArgs {
    dryRun?: boolean;
    verbose?: boolean;
    sourceBranch?: string;
    targetBranch?: string;
    organization?: string;
    project?: string;
    repository?: string;
    pullRequestId?: number;
    model?: string;
    repoRoot?: string;
    includeUncommitted?: boolean;
    seedTest?: boolean;
    help?: boolean;
    ado?: boolean;
    gh?: boolean;
    stack?: string;
    customPrompt?: string;
    includePatterns?: string;
    scoreMin?: number;
    engine?: string;
    generateCommitMessage?: boolean;
    generatePrDescription?: boolean;
    artifactsOnly?: boolean;
    autoFix?: boolean;
}
/** Globs extras no diff quando REVIEW_SELF=true (CI, scripts) — mesclados à stack se INCLUDE_PATTERNS não for explícito. */
export declare const SELF_REVIEW_INCLUDE_EXTRA: readonly ["**/*.yml", "**/*.yaml", "**/*.sh"];
/** Lê um inteiro 0–10 de env/CLI; usa fallback se ausente, inválido ou macro ADO. */
export declare function parseScoreMin(value: string | number | undefined, fallback?: number): number;
/** Mescla padrões da stack com CI/scripts quando o runner revisa a si mesmo. */
export declare function mergeIncludePatternsForSelfReview(base: string[], reviewSelf: boolean): string[];
/** Macro ADO literal quando a variável não existe no variable group / pipeline. */
export declare function isUnexpandedPipelineMacro(value: string): boolean;
/** Indica de onde veio o ID da PR (pipeline ADO, CLI ou env local). */
export declare function resolvePullRequestIdSource(cli: CliArgs, pullRequestId: number): string;
/** Normaliza ref git: `master` → `refs/heads/master`. */
export declare function normalizeBranchRef(ref: string): string;
export declare function loadConfig(argv?: string[]): ReviewerConfig;
export { ProjectValidationError };
//# sourceMappingURL=config.d.ts.map