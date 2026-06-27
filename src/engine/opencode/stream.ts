import {
  createOpencodeClient,
  type AssistantMessage,
  type OpencodeClient,
  type Part,
} from '@opencode-ai/sdk';
import { logAgentPromptBeforeSend } from '../../agent/log-prompt.js';
import type { ReviewerConfig } from '../../config.js';
import { env, ENV } from '../../env.js';
import type { Logger } from '../../logger.js';
import { ENGINE_METRIC_KEYS, EMPTY_METRICS } from '../types.js';
import { startOpencodeEventStream } from './event-stream.js';
import { type OpencodeModelSelection, resolveOpencodeModelSelection } from './model.js';
import {
  buildSessionPromptBody,
  shouldFallbackSessionPromptWithoutModel,
} from './prompt-body.js';
import { buildOpencodeServerConfig, resolveServerLogEnabled } from './server-config.js';
import { createEmbeddedOpencodeServer } from './server.js';

export interface OpencodeRunResult {
  sessionId: string;
  runId: string;
  status: string;
  fullText: string;
  metrics: Record<string, number>;
}

export interface RunOpencodeOptions {
  name: string;
  prompt: string;
  resumeSessionId?: string;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_HOSTNAME = '127.0.0.1';
const DEFAULT_PORT = 4096;
const DEFAULT_AGENT = 'explore';

type OpencodeRuntime = {
  client: OpencodeClient;
  close: () => void;
};

function resolveTimeoutMs(): number {
  const envValue = env.timeoutMs()?.trim();
  if (!envValue) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function resolveServerUrl(): string | undefined {
  const raw = env.opencodeUrl()?.trim();
  return raw || undefined;
}

function resolveHostname(): string {
  return env.opencodeHostname()?.trim() || DEFAULT_HOSTNAME;
}

function resolvePort(): number {
  const raw = env.opencodePort()?.trim();
  if (!raw) return DEFAULT_PORT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_PORT;
}

function resolveAgentName(): string {
  return env.opencodeAgent()?.trim() || DEFAULT_AGENT;
}

function assertResponseData<T>(result: { data?: T; error?: unknown }, context: string): T {
  if (result.error) {
    throw new Error(`${context}: ${JSON.stringify(result.error)}`);
  }
  if (result.data === undefined) {
    throw new Error(`${context}: resposta vazia do servidor OpenCode`);
  }
  return result.data;
}

function extractTextFromParts(parts: Part[]): string {
  return parts
    .filter((part): part is Extract<Part, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('');
}

function logToolParts(parts: Part[], logger: Logger): void {
  for (const part of parts) {
    if (part.type === 'tool') {
      logger.info(`[tool] ${part.tool} — ${part.state.status}`);
    }
  }
}

function assistantMessageToMetrics(info: AssistantMessage): Record<string, number> {
  const tokens = info.tokens;
  if (!tokens || (tokens.input === 0 && tokens.output === 0)) {
    return { ...EMPTY_METRICS };
  }

  const metrics: Record<string, number> = {
    [ENGINE_METRIC_KEYS.inputTokens]: tokens.input,
    [ENGINE_METRIC_KEYS.outputTokens]: tokens.output,
    [ENGINE_METRIC_KEYS.totalTokens]: tokens.input + tokens.output,
  };

  if (tokens.cache.read > 0) {
    metrics[ENGINE_METRIC_KEYS.cacheReadTokens] = tokens.cache.read;
  }
  if (tokens.cache.write > 0) {
    metrics[ENGINE_METRIC_KEYS.cacheWriteTokens] = tokens.cache.write;
  }

  return metrics;
}

async function createRuntime(
  config: ReviewerConfig,
  model: string,
  signal: AbortSignal,
  logger: Logger,
): Promise<OpencodeRuntime> {
  const directory = config.repoRoot;
  const externalUrl = resolveServerUrl();

  if (externalUrl) {
    logger.info(`OpenCode: conectando ao servidor existente em ${externalUrl}`);
    return {
      client: createOpencodeClient({ baseUrl: externalUrl, directory }),
      close: () => {},
    };
  }

  const hostname = resolveHostname();
  const port = resolvePort();
  logger.info(`OpenCode: iniciando servidor embutido em ${hostname}:${port}`);

  const logServerOutput = resolveServerLogEnabled();
  const server = await createEmbeddedOpencodeServer({
    hostname,
    port,
    signal,
    timeout: 30_000,
    config: buildOpencodeServerConfig(model),
    logServerOutput,
    logger,
  });

  logger.info(`OpenCode server: ${server.url}`);
  if (logServerOutput) {
    logger.info('OpenCode server log: ON (defina AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG=false para desativar)');
  }

  return {
    client: createOpencodeClient({ baseUrl: server.url, directory }),
    close: () => server.close(),
  };
}

async function resolveSessionId(
  client: OpencodeClient,
  options: RunOpencodeOptions,
  directory: string,
  logger: Logger,
): Promise<string> {
  if (options.resumeSessionId) {
    const existing = await client.session.get({
      path: { id: options.resumeSessionId },
      query: { directory },
    });
    assertResponseData(existing, 'session.get');
    logger.info(`Sessão retomada: ${options.resumeSessionId}`);
    return options.resumeSessionId;
  }

  const created = await client.session.create({
    body: { title: options.name },
    query: { directory },
  });
  const session = assertResponseData(created, 'session.create');
  logger.info(`Sessão criada: ${session.id}`);
  return session.id;
}

type SessionPromptResponse = {
  info: AssistantMessage;
  parts: Part[];
};

async function sendSessionPrompt(
  client: OpencodeClient,
  sessionId: string,
  directory: string,
  agentName: string,
  prompt: string,
  modelSelection: OpencodeModelSelection,
  logger: Logger,
): Promise<SessionPromptResponse> {
  const withModel = await client.session.prompt({
    path: { id: sessionId },
    query: { directory },
    body: buildSessionPromptBody(agentName, prompt, modelSelection),
  });

  if (!withModel.error) {
    logger.info(`Modelo no prompt: ${modelSelection.composite}`);
    return assertResponseData(withModel, 'session.prompt');
  }

  if (!shouldFallbackSessionPromptWithoutModel(withModel.error)) {
    throw new Error(`session.prompt: ${JSON.stringify(withModel.error)}`);
  }

  logger.warn(
    `session.prompt com model=${modelSelection.composite} rejeitado pelo servidor; ` +
      `usando default do OpenCode. Erro: ${JSON.stringify(withModel.error)}`,
  );

  const fallback = await client.session.prompt({
    path: { id: sessionId },
    query: { directory },
    body: buildSessionPromptBody(agentName, prompt),
  });

  return assertResponseData(fallback, 'session.prompt (fallback sem model)');
}

export async function runOpencodeStream(
  config: ReviewerConfig,
  options: RunOpencodeOptions,
  logger: Logger,
): Promise<OpencodeRunResult> {
  logger.section(`Agente (OpenCode): ${options.name}`);

  const modelSelection = resolveOpencodeModelSelection(config.model);
  const timeoutMs = resolveTimeoutMs();
  const agentName = resolveAgentName();
  const directory = config.repoRoot;

  logger.info(`Modelo (config): ${modelSelection.composite}`);
  logger.info(`Agente OpenCode: ${agentName}`);
  logger.info(`CWD: ${directory}`);
  logger.info(`Timeout: ${(timeoutMs / 1000).toFixed(0)}s`);
  logger.debug('Prompt length (chars):', options.prompt.length);

  logAgentPromptBeforeSend(logger, options.prompt);

  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort(), timeoutMs);
  let runtime: OpencodeRuntime | undefined;
  let sessionId: string | undefined;

  try {
    runtime = await createRuntime(config, modelSelection.composite, abortController.signal, logger);
    const { client } = runtime;

    sessionId = await resolveSessionId(client, options, directory, logger);

    const eventStream = startOpencodeEventStream({
      client,
      sessionId,
      directory,
      logger,
      signal: abortController.signal,
    });

    logger.info('Enviando prompt ao agente OpenCode (aguarde — progresso via event stream)...');

    let response: SessionPromptResponse;
    try {
      response = await sendSessionPrompt(
        client,
        sessionId,
        directory,
        agentName,
        options.prompt,
        modelSelection,
        logger,
      );
    } finally {
      eventStream.stop();
    }
    const info = response.info;
    const fullText = extractTextFromParts(response.parts);

    logToolParts(response.parts, logger);

    if (info.error) {
      throw new Error(`OpenCode assistant error: ${info.error.name} — ${JSON.stringify(info.error.data)}`);
    }

    if (!fullText.trim()) {
      throw new Error('OpenCode retornou resposta vazia (nenhum TextPart na mensagem).');
    }

    logger.info('');
    logger.info(`Mensagem concluída: ${info.finish ?? 'completed'}`);

    return {
      sessionId,
      runId: info.id,
      status: info.finish ?? 'completed',
      fullText,
      metrics: assistantMessageToMetrics(info),
    };
  } catch (error) {
    if (abortController.signal.aborted) {
      if (runtime?.client && sessionId) {
        await runtime.client.session.abort({ path: { id: sessionId }, query: { directory } }).catch(() => {});
      }
      throw new Error(
        `Timeout: agente OpenCode excedeu ${(timeoutMs / 1000).toFixed(0)}s. ` +
          `Aumente ${ENV.TIMEOUT_MS} se necessário.`,
      );
    }

    logger.error('\n[DETALHES DO ERRO FATAL - OPENCODE]');
    if (error instanceof Error) {
      logger.error(`Message: ${error.message}`);
      if (error.cause) logger.error(`Cause: ${error.cause}`);
      logger.error(`Stack: ${error.stack}`);
    } else {
      logger.error(String(error));
    }

    process.exitCode = 1;
    throw error;
  } finally {
    clearTimeout(timeoutHandle);

    if (runtime?.client && sessionId && !options.resumeSessionId) {
      await runtime.client.session.delete({ path: { id: sessionId }, query: { directory } }).catch(() => {});
    }

    runtime?.close();
  }
}
