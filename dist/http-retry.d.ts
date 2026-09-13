/** Utilitários de retry/backoff compartilhados entre clientes HTTP (ADO, GitHub). */
export declare const DEFAULT_HTTP_MAX_RETRIES = 3;
export declare function truncateResponseText(text: string, max?: number): string;
export declare function parseRetryAfterSeconds(header: string | null): number | undefined;
export declare function isRetryableHttpStatus(status: number): boolean;
export declare function backoffDelayMs(attempt: number, retryAfterSeconds?: number): number;
export declare function sleepBackoff(attempt: number, retryAfterSeconds?: number): Promise<void>;
/**
 * Heurística conservadora: JWT/OAuth começa com `eyJ` (header base64).
 * PATs ADO/GitHub não usam esse prefixo — evita falso positivo com `.` no token.
 */
export declare function isJwtAccessToken(token: string): boolean;
export interface GraphqlPageInfo {
    hasNextPage: boolean;
    endCursor: string | null;
}
/** Acumula todas as páginas de uma connection GraphQL via cursor. */
export declare function paginateGraphqlConnection<T>(fetchPage: (after: string | null) => Promise<{
    nodes: T[];
    pageInfo: GraphqlPageInfo;
}>, startAfter?: string | null): Promise<T[]>;
//# sourceMappingURL=http-retry.d.ts.map