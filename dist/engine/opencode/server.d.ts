import type { Config } from '@opencode-ai/sdk';
import type { Logger } from '../../logger.js';
export type EmbeddedOpencodeServerOptions = {
    hostname?: string;
    /** Porta preferida (default 4096). `0` = só porta livre do SO. */
    port?: number;
    signal?: AbortSignal;
    timeout?: number;
    config?: Config;
    logServerOutput?: boolean;
    logger?: Logger;
    /** Tentativas sequenciais a partir da preferida antes de porta aleatória (default: 10). */
    portAttempts?: number;
    /** Reutilizar `opencode serve` já em execução na porta (default: false — harness embutido exige spawn próprio). */
    reuseExisting?: boolean;
    /** Mata processo que ocupa a porta (default: env `AGENTIC_CODE_REVIEWERS_OPENCODE_KILL_PORT`). */
    killPortOccupier?: boolean;
};
export type EmbeddedOpencodeServer = {
    url: string;
    /** Porta efetiva (parseada da URL de listen). */
    port: number;
    close(): void;
};
export type PortProbeResult = 'free' | 'reuse' | 'occupied';
export declare function buildOpencodeServerUrl(hostname: string, port: number): string;
export declare function parseUrlPort(url: string): number;
export declare function isServeErrorOutput(output: string): boolean;
export declare function parseOpencodeServerListenUrl(line: string): string | undefined;
export declare function formatOpencodeNotFoundError(): string;
/** Resolve o executável do CLI OpenCode (PATH, install padrão ou env). */
export declare function resolveOpencodeBinary(explicit?: string): string;
export declare function isOpencodeNotFoundError(error: unknown): boolean;
/** Harness embutido (permission/instructions) exige spawn com OPENCODE_CONFIG_CONTENT — não reutilizar servidor alheio. */
export declare function shouldOwnEmbeddedOpencodeServer(config: Config | undefined, reuseExisting?: boolean): boolean;
export declare function isTcpPortOpen(hostname: string, port: number, timeoutMs?: number): Promise<boolean>;
export declare function isOpencodeServerReachable(baseUrl: string, signal?: AbortSignal): Promise<boolean>;
/** Reserva uma porta TCP livre no host (libera antes de `opencode serve`). */
export declare function reserveFreePort(hostname: string): Promise<number>;
export declare function probeOpencodePort(hostname: string, port: number, signal?: AbortSignal): Promise<PortProbeResult>;
/**
 * Servidor embutido: reutiliza OpenCode na porta preferida, tenta sequência ou porta livre do SO.
 * A URL efetiva é retornada ao caller (`createOpencodeClient({ baseUrl: server.url })`).
 */
export declare function createEmbeddedOpencodeServer(options?: EmbeddedOpencodeServerOptions): Promise<EmbeddedOpencodeServer>;
//# sourceMappingURL=server.d.ts.map