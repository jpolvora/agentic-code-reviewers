export declare function closeAllOpencodeAgents(): Promise<void>;
export declare function isHeadersTimeoutError(error: unknown): boolean;
/** Rejeita quando `signal` aborta, mesmo se a promise subjacente não honrar AbortSignal. */
export declare function withAbortSignal<T>(signal: AbortSignal, promise: Promise<T>): Promise<T>;
/**
 * Fetch para o client OpenCode: `session.prompt` só devolve headers quando o agente termina.
 * `runSignal` cancela o HTTP no mesmo instante do AbortController do runner.
 */
export declare function createOpencodeFetch(timeoutMs: number, runSignal?: AbortSignal): typeof fetch;
//# sourceMappingURL=fetch.d.ts.map