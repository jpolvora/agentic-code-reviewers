import { Agent, fetch as undiciFetch } from 'undici';

const HEADERS_TIMEOUT_CODES = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

const agents = new Map<number, Agent>();

function agentForTimeout(timeoutMs: number): Agent {
  let agent = agents.get(timeoutMs);
  if (!agent) {
    agent = new Agent({
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      connectTimeout: 60_000,
    });
    agents.set(timeoutMs, agent);
  }
  return agent;
}

export async function closeAllOpencodeAgents(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  for (const agent of agents.values()) {
    closePromises.push(agent.close());
  }
  agents.clear();
  await Promise.all(closePromises);
}

export function isHeadersTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  if ('code' in error && typeof error.code === 'string' && HEADERS_TIMEOUT_CODES.has(error.code)) {
    return true;
  }
  if ('cause' in error) return isHeadersTimeoutError(error.cause);
  return false;
}

function mergeAbortSignals(
  runSignal: AbortSignal | undefined,
  requestSignal: AbortSignal | null | undefined,
): AbortSignal | undefined {
  const signals: AbortSignal[] = [];
  if (runSignal) signals.push(runSignal);
  if (requestSignal) signals.push(requestSignal);
  if (signals.length === 0) return undefined;
  if (signals.length === 1) return signals[0];
  return AbortSignal.any(signals);
}

function toAbortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error('The operation was aborted');
  error.name = 'AbortError';
  return error;
}

/** Rejeita quando `signal` aborta, mesmo se a promise subjacente não honrar AbortSignal. */
export function withAbortSignal<T>(signal: AbortSignal, promise: Promise<T>): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(toAbortError(signal));
  }

  return new Promise((resolve, reject) => {
    const onAbort = () => reject(toAbortError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Fetch para o client OpenCode: `session.prompt` só devolve headers quando o agente termina.
 * `runSignal` cancela o HTTP no mesmo instante do AbortController do runner.
 */
export function createOpencodeFetch(timeoutMs: number, runSignal?: AbortSignal): typeof fetch {
  const agent = agentForTimeout(timeoutMs);

  return (input, init) => {
    const signal = mergeAbortSignals(runSignal, init?.signal ?? undefined);
    return undiciFetch(input as Parameters<typeof undiciFetch>[0], {
      ...init,
      signal,
      dispatcher: agent,
    } as Parameters<typeof undiciFetch>[1]) as ReturnType<typeof fetch>;
  };
}
