import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';
export declare function buildAutoFixCommitMessage(config: ReviewerConfig, threadIds?: string[]): string;
/** HEAD local à frente de origin/<branch> (commit pendente de push). */
export declare function isLocalAheadOfRemote(repoRoot: string): boolean;
/** Stage + commit local; não faz push (gate cooperativo: push após resolução de threads). */
export declare function commitAutoFixChanges(config: ReviewerConfig, logger: Logger, changedPaths: string[], threadIds?: string[]): Promise<boolean>;
/** Push após resolução bem-sucedida das threads (contrato COOPERATIVE_FIX.md). */
export declare function pushAutoFixChanges(config: ReviewerConfig, logger: Logger): Promise<boolean>;
/** @deprecated Use commitAutoFixChanges + pushAutoFixChanges (gate cooperativo). */
export declare function runAutoFixCommit(config: ReviewerConfig, logger: Logger, changedPaths: string[]): Promise<boolean>;
//# sourceMappingURL=autofix-commit.d.ts.map