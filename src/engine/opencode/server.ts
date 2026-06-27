import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import type { Config } from '@opencode-ai/sdk';
import { ENV, env } from '../../env.js';
import type { Logger } from '../../logger.js';

export type EmbeddedOpencodeServerOptions = {
  hostname?: string;
  /** Porta preferida (default 4096). `0` = só porta livre do SO. */
  port?: number;
  signal?: AbortSignal;
  timeout?: number;
  config?: Config;
  logServerOutput?: boolean;
  logger?: Logger;
  /** Tentativas sequenciais a partir da preferida antes de porta aleatória (default: 10). */
  portAttempts?: number;
  /** Mata processo que ocupa a porta (default: env `AGENTIC_CODE_REVIEWERS_OPENCODE_KILL_PORT`). */
  killPortOccupier?: boolean;
};

export type EmbeddedOpencodeServer = {
  url: string;
  /** Porta efetiva (parseada da URL de listen). */
  port: number;
  close(): void;
};

export type PortProbeResult = 'free' | 'reuse' | 'occupied';

const DEFAULT_PORT = 4096;
const DEFAULT_PORT_ATTEMPTS = 10;
const PORT_PROBE_TIMEOUT_MS = 1_500;
const HTTP_PROBE_TIMEOUT_MS = 2_000;

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

export function buildOpencodeServerUrl(hostname: string, port: number): string {
  return `http://${hostname}:${port}`;
}

export function parseUrlPort(url: string): number {
  const parsed = new URL(url);
  if (parsed.port) return Number(parsed.port);
  return parsed.protocol === 'https:' ? 443 : 80;
}

export function isServeErrorOutput(output: string): boolean {
  return /ServeError/i.test(output);
}

export function parseOpencodeServerListenUrl(line: string): string | undefined {
  if (!line.startsWith('opencode server listening')) return undefined;
  const match = line.match(/on\s+(https?:\/\/[^\s]+)/);
  return match?.[1];
}

export function isTcpPortOpen(hostname: string, port: number, timeoutMs = PORT_PROBE_TIMEOUT_MS): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: hostname, port });
    const finish = (open: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(open);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

export async function isOpencodeServerReachable(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<boolean> {
  const timeoutSignal = AbortSignal.timeout(HTTP_PROBE_TIMEOUT_MS);
  const probeSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await fetch(baseUrl, { signal: probeSignal });
    return response.ok;
  } catch {
    return false;
  }
}

/** Reserva uma porta TCP livre no host (libera antes de `opencode serve`). */
export function reserveFreePort(hostname: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Falha ao reservar porta livre')));
        return;
      }
      const port = address.port;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

export async function probeOpencodePort(
  hostname: string,
  port: number,
  signal?: AbortSignal,
): Promise<PortProbeResult> {
  if (!(await isTcpPortOpen(hostname, port))) return 'free';

  const url = buildOpencodeServerUrl(hostname, port);
  if (await isOpencodeServerReachable(url, signal)) return 'reuse';

  return 'occupied';
}

function shouldKillPortOccupier(options: EmbeddedOpencodeServerOptions): boolean {
  if (options.killPortOccupier !== undefined) return options.killPortOccupier;
  const raw = env.opencodeKillPort()?.trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function findListeningPidsWindows(port: number): number[] {
  const out = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
  if (out.status !== 0 || !out.stdout) return [];

  const pids = new Set<number>();
  const needle = `:${port}`;
  for (const line of out.stdout.split(/\r?\n/)) {
    if (!line.includes('LISTENING') || !line.includes(needle)) continue;
    const pid = Number(line.trim().split(/\s+/).at(-1));
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

function findListeningPidsUnix(port: number): number[] {
  const out = spawnSync('ss', ['-ltnp'], { encoding: 'utf8' });
  if (out.status !== 0 || !out.stdout) {
    const lsof = spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
    if (lsof.status !== 0 || !lsof.stdout?.trim()) return [];
    return lsof.stdout
      .trim()
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  }

  const pids = new Set<number>();
  const needle = `:${port}`;
  for (const line of out.stdout.split(/\r?\n/)) {
    if (!line.includes('LISTEN') || !line.includes(needle)) continue;
    const match = line.match(/pid=(\d+)/);
    if (match) pids.add(Number(match[1]));
  }
  return [...pids];
}

function killPortOccupier(hostname: string, port: number, logger?: Logger): boolean {
  const pids =
    process.platform === 'win32' ? findListeningPidsWindows(port) : findListeningPidsUnix(port);

  if (pids.length === 0) {
    logger?.warn(`OpenCode: nenhum PID em LISTEN para ${hostname}:${port} (kill ignorado)`);
    return false;
  }

  let killed = false;
  for (const pid of pids) {
    if (process.platform === 'win32') {
      const out = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
      if (!out.error && out.status === 0) killed = true;
    } else {
      try {
        process.kill(pid, 'SIGTERM');
        killed = true;
      } catch {
        // ignore
      }
    }
  }

  if (killed) {
    logger?.warn(`OpenCode: processo na porta ${port} encerrado (${ENV.OPENCODE_KILL_PORT}=true)`);
  }
  return killed;
}

async function spawnEmbeddedOpencodeServer(
  hostname: string,
  port: number,
  options: EmbeddedOpencodeServerOptions,
): Promise<EmbeddedOpencodeServer> {
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
        const serverUrl = parseOpencodeServerListenUrl(line);
        if (!serverUrl) continue;

        clearTimeout(timer);
        resolved = true;
        resolve(serverUrl);
        return;
      }
    };

    proc.stdout?.on('data', onChunk);
    proc.stderr?.on('data', onChunk);

    proc.on('exit', (code) => {
      if (resolved) return;
      clearTimeout(timer);
      let message = `OpenCode server exited with code ${code}`;
      if (output.trim()) {
        message += `\nServer output: ${output.trim()}`;
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
    port: parseUrlPort(url),
    close() {
      clearAbort();
      stopProcess(proc);
    },
  };
}

async function tryStartOnPort(
  hostname: string,
  port: number,
  options: EmbeddedOpencodeServerOptions,
): Promise<EmbeddedOpencodeServer | undefined> {
  const logger = options.logger;
  const killOccupier = shouldKillPortOccupier(options);

  let probe = await probeOpencodePort(hostname, port, options.signal);

  if (probe === 'occupied' && killOccupier) {
    if (killPortOccupier(hostname, port, logger)) {
      probe = await probeOpencodePort(hostname, port, options.signal);
    }
  }

  if (probe === 'reuse') {
    const url = buildOpencodeServerUrl(hostname, port);
    logger?.info(`OpenCode: reutilizando servidor existente em ${url}`);
    return { url, port, close: () => {} };
  }

  if (probe === 'occupied') {
    logger?.warn(`OpenCode: porta ${port} ocupada por outro processo; tentando outra...`);
    return undefined;
  }

  try {
    return await spawnEmbeddedOpencodeServer(hostname, port, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isServeErrorOutput(message)) {
      logger?.warn(`OpenCode: ServeError em ${hostname}:${port}; tentando outra porta...`);
      return undefined;
    }
    throw error;
  }
}

/**
 * Servidor embutido: reutiliza OpenCode na porta preferida, tenta sequência ou porta livre do SO.
 * A URL efetiva é retornada ao caller (`createOpencodeClient({ baseUrl: server.url })`).
 */
export async function createEmbeddedOpencodeServer(
  options: EmbeddedOpencodeServerOptions = {},
): Promise<EmbeddedOpencodeServer> {
  const hostname = options.hostname ?? '127.0.0.1';
  const configuredPort = options.port ?? DEFAULT_PORT;
  const ephemeralOnly = configuredPort === 0;
  const preferredPort = ephemeralOnly ? undefined : configuredPort;
  const portAttempts = options.portAttempts ?? DEFAULT_PORT_ATTEMPTS;
  const logger = options.logger;

  const portsToTry: number[] = [];

  if (preferredPort !== undefined) {
    for (let offset = 0; offset < portAttempts; offset++) {
      portsToTry.push(preferredPort + offset);
    }
  }

  portsToTry.push(await reserveFreePort(hostname));

  for (let index = 0; index < portsToTry.length; index++) {
    const port = portsToTry[index]!;
    const started = await tryStartOnPort(hostname, port, options);
    if (!started) continue;

    if (preferredPort !== undefined && started.port !== preferredPort) {
      logger?.info(
        `OpenCode: servidor embutido em ${started.url} (preferida: ${preferredPort})`,
      );
    }

    return started;
  }

  throw new Error(
    `Não foi possível iniciar servidor OpenCode embutido (${hostname}, preferida: ${preferredPort ?? 'auto'}).`,
  );
}
