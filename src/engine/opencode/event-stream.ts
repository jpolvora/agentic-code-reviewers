import type { Event, GlobalEvent, OpencodeClient, Part, Permission } from '@opencode-ai/sdk';
import path from 'node:path';
import type { Logger } from '../../logger.js';

export type OpencodeEventStreamOptions = {
  client: OpencodeClient;
  sessionId: string;
  directory: string;
  logger: Logger;
  signal: AbortSignal;
};

type PermissionReply = 'once' | 'always' | 'reject';

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

function belongsToSession(event: Event, sessionId: string): boolean {
  const properties = event.properties as { sessionID?: string };
  if (!properties.sessionID) {
    return event.type === 'session.error';
  }
  return properties.sessionID === sessionId;
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
  if (!directoriesMatch(event.directory, options.directory)) return;

  const payload = event.payload;
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

      const delta = payload.properties.delta;
      if (!delta) return;

      if (part.type === 'text') {
        writeStreamDelta('[assistant] ', 'assistant', delta, streamState, options.logger);
      } else if (part.type === 'reasoning') {
        writeStreamDelta('[reasoning] ', 'reasoning', delta, streamState, options.logger);
      }
      break;
    }
    default:
      break;
  }
}

type StreamState = {
  lastStream: 'assistant' | 'reasoning' | 'other';
  toolStatuses: Map<string, string>;
};

function writeStreamDelta(
  prefix: string,
  stream: 'assistant' | 'reasoning',
  delta: string,
  state: StreamState,
  logger: Logger,
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

export async function consumeOpencodeEventStream(options: OpencodeEventStreamOptions): Promise<void> {
  const streamState: StreamState = {
    lastStream: 'other',
    toolStatuses: new Map(),
  };

  const events = await options.client.global.event({ signal: options.signal });

  for await (const raw of events.stream) {
    if (options.signal.aborted) break;
    handleEvent(raw as GlobalEvent, options, streamState);
  }

  if (streamState.lastStream !== 'other') {
    process.stdout.write('\n');
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
