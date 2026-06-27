import { Agent } from 'undici';

/** Margem sobre TIMEOUT_MS para o cliente HTTP não vencer o AbortController com HeadersTimeoutError. */
const FETCH_TIMEOUT_GRACE_MS = 60_000;

const agents = new Map<number, Agent>();

function agentForTimeout(timeoutMs: number): Agent {
  const limitMs = timeoutMs + FETCH_TIMEOUT_GRACE_MS;
  let agent = agents.get(limitMs);
  if (!agent) {
    agent = new Agent({
      headersTimeout: limitMs,
      bodyTimeout: limitMs,
      connectTimeout: 60_000,
    });
    agents.set(limitMs, agent);
  }
  return agent;
}

/**
 * Fetch para o client OpenCode: `session.prompt` só devolve headers quando o agente termina,
 * então precisa de `headersTimeout` alinhado a {@link AGENTIC_CODE_REVIEWERS_TIMEOUT_MS}.
 */
export function createOpencodeFetch(timeoutMs: number): typeof fetch {
  const agent = agentForTimeout(timeoutMs);

  return (input, init) =>
    globalThis.fetch(input, {
      ...init,
      dispatcher: agent,
    } as unknown as RequestInit);
}
