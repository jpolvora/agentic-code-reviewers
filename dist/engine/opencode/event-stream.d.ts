import type { Event, GlobalEvent, OpencodeClient, Part } from '@opencode-ai/sdk';
import type { Logger } from '../../logger.js';
export type OpencodeEventStreamOptions = {
    client: OpencodeClient;
    sessionId: string;
    directory: string;
    logger: Logger;
    signal: AbortSignal;
    /** Aborta o run principal quando o stream detecta falha fatal (ex.: servidor morto). */
    fatalAbort?: AbortController;
    /** Quando true (`--verbose` / `AGENTIC_CODE_REVIEWERS_VERBOSE`), stream de partes `text` (`[assistant]`). */
    verbose: boolean;
    /** Stream reasoning parts (default: env / true). */
    streamReasoning?: boolean;
    /** Intervalo sem eventos SSE antes de sondar o servidor (default: 30s). */
    streamInactivityMs?: number;
};
export declare class OpencodeStreamInactivityError extends Error {
    constructor(message: string);
}
type PermissionReply = 'once' | 'always' | 'reject';
type TextLikePart = Extract<Part, {
    type: 'text' | 'reasoning';
}>;
export declare function directoriesMatch(left: string, right: string): boolean;
export declare function permissionReplyForType(permissionType: string): PermissionReply;
export declare function formatSessionStatus(status: {
    type: string;
    message?: string;
    attempt?: number;
}): string;
export declare function formatToolPart(part: Extract<Part, {
    type: 'tool';
}>): string;
export declare function isTextLikePart(part: Part): part is TextLikePart;
/** Extrai chunk para stream SSE: `delta` incremental ou diff de `part.text`. */
export declare function extractPartStreamChunk(part: TextLikePart, printedLength: number, delta?: string): {
    chunk: string;
    nextLength: number;
} | undefined;
export declare function formatRawEventForLog(raw: unknown): string;
export declare function isGlobalEvent(raw: unknown): raw is GlobalEvent;
/** Converte eventos `payload.type === "sync"` para o formato legado consumido por `handleEvent`. */
export declare function normalizeSyncEvent(syncType: string, data: Record<string, unknown>): Event | undefined;
/**
 * Aceita envelope legado (`properties`) ou sync (`syncEvent`).
 * Retorna `'skip'` para sync válido sem handler (ex.: `session.updated.1`).
 */
export declare function parseGlobalEvent(raw: unknown): GlobalEvent | 'skip' | undefined;
export declare function eventBelongsToSession(event: Event, sessionId: string): boolean;
/** Sonda session.get para confirmar que o servidor OpenCode ainda responde. */
export declare function checkOpencodeStreamHealth(options: Pick<OpencodeEventStreamOptions, 'client' | 'sessionId' | 'directory'>, signal?: AbortSignal): Promise<boolean>;
export declare function consumeOpencodeEventStream(options: OpencodeEventStreamOptions): Promise<void>;
export declare function startOpencodeEventStream(options: OpencodeEventStreamOptions): {
    stop: () => void;
};
export {};
//# sourceMappingURL=event-stream.d.ts.map