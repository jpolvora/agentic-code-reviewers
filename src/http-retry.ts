/** Utilitários de retry/backoff compartilhados entre clientes HTTP (ADO, GitHub). */

export const DEFAULT_HTTP_MAX_RETRIES = 3;

export function truncateResponseText(text: string, max = 2000): string {
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, max - 3)}...`;
}

export function parseRetryAfterSeconds(header: string | null): number | undefined {
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

export function isRetryableHttpStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

export function backoffDelayMs(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds != null && retryAfterSeconds > 0) {
    return Math.min(retryAfterSeconds * 1000, 30_000);
  }
  return Math.min(1000 * 2 ** (attempt - 1), 8000);
}

export async function sleepBackoff(attempt: number, retryAfterSeconds?: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, backoffDelayMs(attempt, retryAfterSeconds)));
}

/**
 * Heurística conservadora: JWT/OAuth começa com `eyJ` (header base64).
 * PATs ADO/GitHub não usam esse prefixo — evita falso positivo com `.` no token.
 */
export function isJwtAccessToken(token: string): boolean {
  return token.trim().startsWith('eyJ');
}

export interface GraphqlPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

/** Acumula todas as páginas de uma connection GraphQL via cursor. */
export async function paginateGraphqlConnection<T>(
  fetchPage: (after: string | null) => Promise<{ nodes: T[]; pageInfo: GraphqlPageInfo }>,
  startAfter: string | null = null,
): Promise<T[]> {
  const all: T[] = [];
  let after: string | null = startAfter;

  do {
    const page = await fetchPage(after);
    all.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);

  return all;
}
