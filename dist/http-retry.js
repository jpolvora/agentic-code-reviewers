/** Utilitários de retry/backoff compartilhados entre clientes HTTP (ADO, GitHub). */
export const DEFAULT_HTTP_MAX_RETRIES = 3;
export function truncateResponseText(text, max = 2000) {
    if (text.length <= max) {
        return text;
    }
    return `${text.slice(0, max - 3)}...`;
}
export function parseRetryAfterSeconds(header) {
    if (!header?.trim()) {
        return undefined;
    }
    const seconds = Number(header.trim());
    if (Number.isFinite(seconds) && seconds > 0) {
        return seconds;
    }
    const retryDate = Date.parse(header);
    if (!Number.isNaN(retryDate)) {
        const deltaSeconds = Math.ceil((retryDate - Date.now()) / 1000);
        return deltaSeconds > 0 ? deltaSeconds : undefined;
    }
    return undefined;
}
export function isRetryableHttpStatus(status) {
    return status === 429 || (status >= 500 && status < 600);
}
export function backoffDelayMs(attempt, retryAfterSeconds) {
    if (retryAfterSeconds != null && retryAfterSeconds > 0) {
        return Math.min(retryAfterSeconds * 1000, 30_000);
    }
    return Math.min(1000 * 2 ** (attempt - 1), 8000);
}
export async function sleepBackoff(attempt, retryAfterSeconds) {
    await new Promise((resolve) => setTimeout(resolve, backoffDelayMs(attempt, retryAfterSeconds)));
}
/**
 * Heurística conservadora: JWT/OAuth começa com `eyJ` (header base64).
 * PATs ADO/GitHub não usam esse prefixo — evita falso positivo com `.` no token.
 */
export function isJwtAccessToken(token) {
    return token.trim().startsWith('eyJ');
}
/** Acumula todas as páginas de uma connection GraphQL via cursor. */
export async function paginateGraphqlConnection(fetchPage, startAfter = null) {
    const all = [];
    let after = startAfter;
    do {
        const page = await fetchPage(after);
        all.push(...page.nodes);
        after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after);
    return all;
}
//# sourceMappingURL=http-retry.js.map