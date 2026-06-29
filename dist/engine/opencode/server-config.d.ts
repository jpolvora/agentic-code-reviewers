import type { Config } from '@opencode-ai/sdk';
import type { ReviewerConfig } from '../../config.js';
export type OpencodeLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export declare function resolveServerLogEnabled(): boolean;
export declare function resolveServerLogLevel(): OpencodeLogLevel | undefined;
/** Config inline do servidor embutido (modelo, harness do projeto, sandbox read-only). */
export declare function buildOpencodeServerConfig(model: string, config?: ReviewerConfig): Config;
//# sourceMappingURL=server-config.d.ts.map