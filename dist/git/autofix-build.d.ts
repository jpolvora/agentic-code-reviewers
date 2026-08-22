import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';
/** Resolve build command: env override → `npm test` → `npm run build` → skip. */
export declare function resolveAutoFixBuildCommand(repoRoot: string, envCommand?: string): string | null;
/** Valida build após commit local; falha aborta resolução e push (gate cooperativo). */
export declare function runAutoFixBuild(config: ReviewerConfig, logger: Logger): Promise<boolean>;
//# sourceMappingURL=autofix-build.d.ts.map