import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import type { Config } from '@opencode-ai/sdk';
import type { Logger } from '../../logger.js';

export type EmbeddedOpencodeServerOptions = {
  hostname?: string;
  port?: number;
  signal?: AbortSignal;
  timeout?: number;
  config?: Config;
  logServerOutput?: boolean;
  logger?: Logger;
};

export type EmbeddedOpencodeServer = {
  url: string;
  close(): void;
};

function stopProcess(proc: ChildProcess): void {
  if (proc.exitCode !== null || proc.signalCode !== null) return;

  if (process.platform === 'win32' && proc.pid) {
    const out = spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
    if (!out.error && out.status === 0) return;
  }

  proc.kill();
}

function bindAbort(proc: ChildProcess, signal: AbortSignal | undefined, onAbort?: () => void): () => void {
  if (!signal) return () => {};

  const abort = () => {
    clear();
    stopProcess(proc);
    onAbort?.();
  };

  const clear = () => {
    signal.removeEventListener('abort', abort);
    proc.off('exit', clear);
    proc.off('error', clear);
  };

  signal.addEventListener('abort', abort, { once: true });
  proc.on('exit', clear);
  proc.on('error', clear);

  if (signal.aborted) abort();

  return clear;
}

function pipeServerLines(
  stream: NodeJS.ReadableStream | null | undefined,
  level: 'info' | 'warn',
  logger: Logger,
): void {
  if (!stream) return;

  let buffer = '';
  stream.on('data', (chunk: Buffer | string) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (level === 'warn') {
        logger.warn(`[opencode-server] ${trimmed}`);
      } else {
        logger.info(`[opencode-server] ${trimmed}`);
      }
    }
  });
}

function parseServerUrl(line: string): string | undefined {
  if (!line.startsWith('opencode server listening')) return undefined;
  const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
  return match?.[1];
}

/** Servidor embutido com pipe opcional de stdout/stderr para o logger do runner. */
export async function createEmbeddedOpencodeServer(
  options: EmbeddedOpencodeServerOptions = {},
): Promise<EmbeddedOpencodeServer> {
  const hostname = options.hostname ?? '127.0.0.1';
  const port = options.port ?? 4096;
  const timeout = options.timeout ?? 30_000;
  const logServerOutput = options.logServerOutput ?? false;
  const logger = options.logger;

  const args = ['serve', `--hostname=${hostname}`, `--port=${port}`];
  if (options.config?.logLevel) {
    args.push(`--log-level=${options.config.logLevel}`);
  }

  const proc = spawn('opencode', args, {
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify(options.config ?? {}),
    },
    windowsHide: true,
  });

  let clearAbort = () => {};

  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      clearAbort();
      stopProcess(proc);
      reject(new Error(`Timeout waiting for OpenCode server to start after ${timeout}ms`));
    }, timeout);

    let output = '';
    let resolved = false;

    const onChunk = (chunk: Buffer | string) => {
      if (resolved) return;

      output += chunk.toString();
      const lines = output.split(/\r?\n/);
      for (const line of lines) {
        const serverUrl = parseServerUrl(line);
        if (!serverUrl) continue;

        clearTimeout(timer);
        resolved = true;
        resolve(serverUrl);
        return;
      }
    };

    proc.stdout?.on('data', onChunk);
    proc.stderr?.on('data', (chunk) => {
      onChunk(chunk);
    });

    proc.on('exit', (code) => {
      if (resolved) return;
      clearTimeout(timer);
      let message = `OpenCode server exited with code ${code}`;
      if (output.trim()) {
        message += `\nServer output: ${output}`;
      }
      reject(new Error(message));
    });

    proc.on('error', (error) => {
      if (resolved) return;
      clearTimeout(timer);
      reject(error);
    });

    clearAbort = bindAbort(proc, options.signal, () => {
      clearTimeout(timer);
      reject(options.signal?.reason ?? new Error('OpenCode server startup aborted'));
    });
  });

  if (logServerOutput && logger) {
    pipeServerLines(proc.stdout, 'info', logger);
    pipeServerLines(proc.stderr, 'warn', logger);
  }

  return {
    url,
    close() {
      clearAbort();
      stopProcess(proc);
    },
  };
}
