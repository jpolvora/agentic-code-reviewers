import { Agent, fetch as undiciFetch } from 'undici';
const HEADERS_TIMEOUT_CODES = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);
const agents = new Map();
function agentForTimeout(timeoutMs) {
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
export async function closeAllOpencodeAgents() {
    const closePromises = [];
    for (const agent of agents.values()) {
        closePromises.push(agent.close());
    }
    agents.clear();
    await Promise.all(closePromises);
}
export function isHeadersTimeoutError(error) {
    if (!error || typeof error !== 'object')
        return false;
    if ('code' in error && typeof error.code === 'string' && HEADERS_TIMEOUT_CODES.has(error.code)) {
        return true;
    }
    if ('cause' in error)
        return isHeadersTimeoutError(error.cause);
    return false;
}
function mergeAbortSignals(...inputs) {
    const signals = inputs.filter((signal) => signal != null);
    if (signals.length === 0)
        return undefined;
    if (signals.length === 1)
        return signals[0];
    return AbortSignal.any(signals);
}
function toAbortError(signal) {
    const reason = signal.reason;
    if (reason instanceof Error)
        return reason;
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    return error;
}
/** Rejeita quando `signal` aborta, mesmo se a promise subjacente não honrar AbortSignal. */
export function withAbortSignal(signal, promise) {
    if (signal.aborted) {
        return Promise.reject(toAbortError(signal));
    }
    return new Promise((resolve, reject) => {
        const onAbort = () => reject(toAbortError(signal));
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then((value) => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, (error) => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}
/** O SDK OpenCode chama `fetch(request)` com `Request` global; undici não reconhece essa classe. */
function toUndiciFetchArgs(input, init, agent, runSignal) {
    const signal = mergeAbortSignals(runSignal, input instanceof Request ? input.signal : undefined, init?.signal ?? undefined);
    if (input instanceof Request) {
        return [
            input.url,
            {
                method: input.method,
                headers: input.headers,
                body: input.body,
                redirect: input.redirect,
                signal,
                dispatcher: agent,
                ...(input.body != null ? { duplex: 'half' } : {}),
            },
        ];
    }
    return [
        input,
        {
            ...init,
            signal,
            dispatcher: agent,
            ...(init?.body != null ? { duplex: 'half' } : {}),
        },
    ];
}
/**
 * Fetch para o client OpenCode: `session.prompt` só devolve headers quando o agente termina.
 * `runSignal` cancela o HTTP no mesmo instante do AbortController do runner.
 */
export function createOpencodeFetch(timeoutMs, runSignal) {
    const agent = agentForTimeout(timeoutMs);
    return (input, init) => {
        const [url, undiciInit] = toUndiciFetchArgs(input, init, agent, runSignal);
        return undiciFetch(url, undiciInit);
    };
}
//# sourceMappingURL=fetch.js.map