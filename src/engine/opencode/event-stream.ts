import type { Event, GlobalEvent, OpencodeClient, Part, Permission } from '@opencode-ai/sdk';
import path from 'node:path';
import { env } from '../../env.js';
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

export class OpencodeStreamInactivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpencodeStreamInactivityError';
  }
}

const DEFAULT_STREAM_INACTIVITY_MS = 30_000;
const STREAM_HEALTH_PROBE_MS = 5_000;

type PermissionReply = 'once' | 'always' | 'reject';

type TextLikePart = Extract<Part, { type: 'text' | 'reasoning' }>;

export function directoriesMatch(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

export function permissionReplyForType(permissionType: string): PermissionReply {
  switch (permissionType) {
    case 'edit':
    case 'bash':
    case 'webfetch':
    case 'doom_loop':
    case 'external_directory':
      return 'reject';
    default:
      return 'reject';
  }
}

export function formatSessionStatus(status: { type: string; message?: string; attempt?: number }): string {
  if (status.type === 'retry') {
    const attempt = status.attempt !== undefined ? ` attempt=${status.attempt}` : '';
    const message = status.message ? `: ${status.message}` : '';
    return `retry${attempt}${message}`;
  }

  return status.message ? `${status.type}: ${status.message}` : status.type;
}

export function formatToolPart(part: Extract<Part, { type: 'tool' }>): string {
  const title = part.state.status === 'completed' ? part.state.title : undefined;
  const suffix = title ? ` — ${title}` : '';
  return `${part.tool} — ${part.state.status}${suffix}`;
}

export function isTextLikePart(part: Part): part is TextLikePart {
  return part.type === 'text' || part.type === 'reasoning';
}

/** Extrai chunk para stream SSE: `delta` incremental ou diff de `part.text`. */
export function extractPartStreamChunk(
  part: TextLikePart,
  printedLength: number,
  delta?: string,
): { chunk: string; nextLength: number } | undefined {
  if (delta) {
    return { chunk: delta, nextLength: printedLength + delta.length };
  }

  if (!part.text || part.text.length <= printedLength) return undefined;
  return { chunk: part.text.slice(printedLength), nextLength: part.text.length };
}

export function formatRawEventForLog(raw: unknown): string {
  if (raw === undefined) return 'undefined';
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

export function isGlobalEvent(raw: unknown): raw is GlobalEvent {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (obj.directory !== undefined && typeof obj.directory !== 'string') return false;
  const payload = obj.payload;
  if (payload === undefined) return true;
  if (typeof payload !== 'object' || payload === null) return false;
  const event = payload as Record<string, unknown>;
  return typeof event.type === 'string' && event.properties !== undefined;
}

function syncLegacyType(syncType: string): string {
  return syncType.endsWith('.1') ? syncType.slice(0, -2) : syncType;
}

/** Converte eventos `payload.type === "sync"` para o formato legado consumido por `handleEvent`. */
export function normalizeSyncEvent(syncType: string, data: Record<string, unknown>): Event | undefined {
  const sessionID = typeof data.sessionID === 'string' ? data.sessionID : undefined;

  switch (syncLegacyType(syncType)) {
    case 'message.part.updated': {
      const part = data.part;
      if (!part || typeof part !== 'object') return undefined;
      return {
        type: 'message.part.updated',
        properties: {
          sessionID,
          part,
          delta: typeof data.delta === 'string' ? data.delta : undefined,
        },
      } as Event;
    }
    case 'session.status': {
      const status = data.status;
      if (!status || typeof status !== 'object') return undefined;
      return {
        type: 'session.status',
        properties: { sessionID, status },
      } as Event;
    }
    case 'session.idle':
      return {
        type: 'session.idle',
        properties: { sessionID },
      } as Event;
    case 'session.error': {
      const error = data.error;
      return {
        type: 'session.error',
        properties: { sessionID, error },
      } as Event;
    }
    case 'permission.updated': {
      const permission = data.permission ?? data;
      if (!permission || typeof permission !== 'object') return undefined;
      return {
        type: 'permission.updated',
        properties: permission,
      } as Event;
    }
    default:
      return undefined;
  }
}

function isSyncEnvelope(raw: Record<string, unknown>): boolean {
  const payload = raw.payload;
  return typeof payload === 'object' && payload !== null && (payload as Record<string, unknown>).type === 'sync';
}

/**
 * Aceita envelope legado (`properties`) ou sync (`syncEvent`).
 * Retorna `'skip'` para sync válido sem handler (ex.: `session.updated.1`).
 */
export function parseGlobalEvent(raw: unknown): GlobalEvent | 'skip' | undefined {
  if (isGlobalEvent(raw)) return raw;

  if (!raw || typeof raw !== 'object') return undefined;
  const envelope = raw as Record<string, unknown>;
  if (envelope.directory !== undefined && typeof envelope.directory !== 'string') return undefined;
  if (!isSyncEnvelope(envelope)) return undefined;

  const payload = envelope.payload as Record<string, unknown>;
  const syncEvent = payload.syncEvent;
  if (!syncEvent || typeof syncEvent !== 'object' || syncEvent === null) return undefined;

  const se = syncEvent as Record<string, unknown>;
  const syncType = se.type;
  if (typeof syncType !== 'string') return undefined;

  const data = se.data;
  if (!data || typeof data !== 'object' || data === null) return undefined;

  const normalizedPayload = normalizeSyncEvent(syncType, data as Record<string, unknown>);
  if (!normalizedPayload) return 'skip';

  return {
    directory: envelope.directory as string | undefined,
    payload: normalizedPayload,
  } as GlobalEvent;
}

export function eventBelongsToSession(event: Event, sessionId: string): boolean {
  const properties = event.properties as { sessionID?: string } | undefined;
  if (!properties?.sessionID) {
    return event.type === 'session.error';
  }
  return properties.sessionID === sessionId;
}

function belongsToSession(event: Event, sessionId: string): boolean {
  return eventBelongsToSession(event, sessionId);
}

function parseStreamFlag(value: string | undefined, defaultValue: boolean): boolean {
  const raw = value?.trim().toLowerCase();
  if (!raw) return defaultValue;
  if (raw === 'false' || raw === '0' || raw === 'off' || raw === 'no') return false;
  if (raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes') return true;
  return defaultValue;
}

function resolveStreamReasoning(options: OpencodeEventStreamOptions): boolean {
  return options.streamReasoning ?? parseStreamFlag(env.opencodeStreamReasoning(), true);
}

async function autoReplyPermission(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
  permission: Permission,
  logger: Logger,
): Promise<void> {
  const response = permissionReplyForType(permission.type);
  logger.info(
    `[permission] ${permission.type} — auto-${response === 'reject' ? 'reject' : response} (${permission.title})`,
  );

  await client.postSessionIdPermissionsPermissionId({
    path: { id: sessionId, permissionID: permission.id },
    query: { directory },
    body: { response },
  });
}

function handleEvent(event: GlobalEvent, options: OpencodeEventStreamOptions, streamState: StreamState): void {
  if (event.directory && !directoriesMatch(event.directory, options.directory)) return;

  const payload = event.payload;
  if (!payload) return;
  if (!belongsToSession(payload, options.sessionId)) return;

  switch (payload.type) {
    case 'session.status':
      options.logger.info(`[status] ${formatSessionStatus(payload.properties.status)}`);
      break;
    case 'session.error': {
      const error = payload.properties.error;
      options.logger.error(`[session.error] ${error ? JSON.stringify(error) : 'unknown error'}`);
      break;
    }
    case 'session.idle':
      options.logger.info('[status] idle');
      break;
    case 'permission.updated':
      void autoReplyPermission(
        options.client,
        options.sessionId,
        options.directory,
        payload.properties,
        options.logger,
      ).catch((error) => {
        options.logger.warn(`[permission] falha ao responder: ${error instanceof Error ? error.message : String(error)}`);
      });
      break;
    case 'message.part.updated': {
      const part = payload.properties.part;
      if (part.type === 'tool') {
        const key = `${part.messageID}:${part.id}`;
        const status = part.state.status;
        if (streamState.toolStatuses.get(key) === status) return;
        streamState.toolStatuses.set(key, status);
        options.logger.info(`[tool] ${formatToolPart(part)}`);
        return;
      }

      if (!isTextLikePart(part)) return;

      const streamReasoning = resolveStreamReasoning(options);
      if (part.type === 'reasoning' && !streamReasoning) return;
      if (part.type === 'text' && !options.verbose) return;

      const printedLength = streamState.partChars.get(part.id) ?? 0;
      const extracted = extractPartStreamChunk(part, printedLength, payload.properties.delta);
      if (!extracted?.chunk) return;

      streamState.partChars.set(part.id, extracted.nextLength);
      const prefix = part.type === 'reasoning' ? '[reasoning] ' : '[assistant] ';
      const stream = part.type === 'reasoning' ? 'reasoning' : 'assistant';
      writeStreamDelta(prefix, stream, extracted.chunk, streamState);
      break;
    }
    default:
      break;
  }
}

type StreamState = {
  lastStream: 'assistant' | 'reasoning' | 'other';
  toolStatuses: Map<string, string>;
  partChars: Map<string, number>;
};

function writeStreamDelta(
  prefix: string,
  stream: 'assistant' | 'reasoning',
  delta: string,
  state: StreamState,
): void {
  if (state.lastStream !== stream) {
    if (state.lastStream !== 'other') {
      process.stdout.write('\n');
    }
    process.stdout.write(`[${new Date().toISOString()}] [INFO] ${prefix}`);
    state.lastStream = stream;
  }

  process.stdout.write(delta);
}

function resolveStreamInactivityMs(options: OpencodeEventStreamOptions): number {
  const configured = options.streamInactivityMs;
  if (configured !== undefined && Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_STREAM_INACTIVITY_MS;
}

/** Sonda session.get para confirmar que o servidor OpenCode ainda responde. */
export async function checkOpencodeStreamHealth(
  options: Pick<OpencodeEventStreamOptions, 'client' | 'sessionId' | 'directory'>,
  signal?: AbortSignal,
): Promise<boolean> {
  const probeSignal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(STREAM_HEALTH_PROBE_MS)])
    : AbortSignal.timeout(STREAM_HEALTH_PROBE_MS);

  try {
    const result = await options.client.session.get({
      path: { id: options.sessionId },
      query: { directory: options.directory },
      signal: probeSignal,
    });
    return !result.error && result.data !== undefined;
  } catch {
    return false;
  }
}

function failStreamOnInactivity(
  options: OpencodeEventStreamOptions,
  streamAbort: AbortController,
  inactivityMs: number,
): void {
  const error = new OpencodeStreamInactivityError(
    `OpenCode server não responde após ${Math.round(inactivityMs / 1000)}s sem eventos no stream SSE`,
  );
  options.fatalAbort?.abort(error);
  streamAbort.abort(error);
}

type InactivityWatchdog = {
  touch: () => void;
  dispose: () => void;
};

function createInactivityWatchdog(
  options: OpencodeEventStreamOptions,
  streamAbort: AbortController,
  streamSignal: AbortSignal,
): InactivityWatchdog {
  const inactivityMs = resolveStreamInactivityMs(options);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let checkRunning = false;

  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };

  const schedule = () => {
    clearTimer();
    if (streamSignal.aborted) return;
    timer = setTimeout(() => void runCheck(), inactivityMs);
  };

  const runCheck = async () => {
    if (streamSignal.aborted || checkRunning) return;
    checkRunning = true;
    try {
      const healthy = await checkOpencodeStreamHealth(options, streamSignal);
      if (streamSignal.aborted) return;
      if (healthy) {
        options.logger.info(
          `OpenCode: sem eventos há ${Math.round(inactivityMs / 1000)}s, servidor OK — aguardando...`,
        );
        schedule();
        return;
      }
      options.logger.error(
        `OpenCode: sem eventos há ${Math.round(inactivityMs / 1000)}s e session.get falhou — encerrando stream`,
      );
      failStreamOnInactivity(options, streamAbort, inactivityMs);
    } finally {
      checkRunning = false;
    }
  };

  schedule();

  return {
    touch: schedule,
    dispose: clearTimer,
  };
}

export async function consumeOpencodeEventStream(options: OpencodeEventStreamOptions): Promise<void> {
  const streamState: StreamState = {
    lastStream: 'other',
    toolStatuses: new Map(),
    partChars: new Map(),
  };

  const streamAbort = new AbortController();
  const streamSignal = options.signal
    ? AbortSignal.any([options.signal, streamAbort.signal])
    : streamAbort.signal;

  const watchdog = createInactivityWatchdog(options, streamAbort, streamSignal);

  try {
    const events = await options.client.global.event({ signal: streamSignal });

    for await (const raw of events.stream) {
      if (streamSignal.aborted) break;
      watchdog.touch();
      const parsed = parseGlobalEvent(raw);
      if (parsed === undefined) {
        options.logger.warn(`OpenCode: evento ignorado (formato inesperado):\n${formatRawEventForLog(raw)}`);
        continue;
      }
      if (parsed === 'skip') continue;
      handleEvent(parsed, options, streamState);
    }

    const reason = streamAbort.signal.reason;
    if (reason instanceof OpencodeStreamInactivityError) {
      throw reason;
    }
  } finally {
    watchdog.dispose();
    if (streamState.lastStream !== 'other') {
      process.stdout.write('\n');
    }
  }
}

export function startOpencodeEventStream(options: OpencodeEventStreamOptions): { stop: () => void } {
  const controller = new AbortController();
  const linkedSignal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;

  const task = consumeOpencodeEventStream({
    ...options,
    signal: linkedSignal,
  }).catch((error) => {
    if (controller.signal.aborted) return;
    if (error instanceof OpencodeStreamInactivityError) {
      options.logger.error(error.message);
      options.fatalAbort?.abort(error);
      return;
    }
    if (linkedSignal.aborted) return;
    options.logger.warn(
      `OpenCode event stream encerrado: ${error instanceof Error ? error.message : String(error)}`,
    );
  });

  return {
    stop() {
      controller.abort();
      void task;
    },
  };
}
