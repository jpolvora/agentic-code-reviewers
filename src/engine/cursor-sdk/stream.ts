import { Agent, CursorAgentError } from '@cursor/sdk';
import type { LocalAgentOptions, Run } from '@cursor/sdk';
import { logAgentPromptBeforeSend } from '../../agent/log-prompt.js';
import type { ReviewerConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
import { resolveAgentModelSelection } from './model.js';
import {
  formatTokenUsageSummary,
  TokenUsageAccumulator,
  type TokenUsageTotals,
} from './token-usage.js';

export interface AgentRunResult {
  agentId: string;
  runId: string;
  status: string;
  fullText: string;
  tokenUsage: TokenUsageTotals;
}

export type { TokenUsageTotals };

export interface RunAgentOptions {
  name: string;
  prompt: string;
  resumeAgentId?: string;
}

/** Default: 10 minutos. Configurável via CURSOR_REVIEWER_TIMEOUT_MS. */
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Opções `local` do agente. O sandbox **força** o modo somente leitura no nível
 * do SDK (restringe escritas ao `cwd` e nega rede): cinto-e-suspensório do
 * contrato read-only declarado no SYSTEM_PROMPT. Desativável via
 * CURSOR_REVIEWER_SANDBOX=false apenas para depuração local.
 */
function buildLocalOptions(config: ReviewerConfig): Required<Pick<LocalAgentOptions, 'sandboxOptions'>> & LocalAgentOptions {
  const sandboxEnabled = process.env.CURSOR_REVIEWER_SANDBOX?.trim().toLowerCase() !== 'false';
  return {
    cwd: config.repoRoot,
    settingSources: ['project'],
    enableAgentRetries: true,
    sandboxOptions: { enabled: sandboxEnabled },
  };
}

function resolveTimeoutMs(): number {
  const envValue = process.env.CURSOR_REVIEWER_TIMEOUT_MS?.trim();
  if (!envValue) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Alguns ambientes (ex.: agentes hospedados de CI) não suportam o sandbox local
 * do SDK. Nesses casos o SDK lança um erro não-retryável citando que o sandbox
 * não é suportado. Detectamos por mensagem para cair para execução sem sandbox.
 */
function isSandboxUnsupportedError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /sandbox(ing)? .*not supported/i.test(error.message);
}

export async function runAgentStream(
  config: ReviewerConfig,
  options: RunAgentOptions,
  logger: Logger,
): Promise<AgentRunResult> {
  logger.section(`Agente: ${options.name}`);
  logger.info(`Modelo: ${config.model}`);
  logger.info(`CWD: ${config.repoRoot}`);
  logger.debug('Prompt length (chars):', options.prompt.length);

  const modelSelection = resolveAgentModelSelection(config.model);
  const timeoutMs = resolveTimeoutMs();
  logger.info(`Timeout: ${(timeoutMs / 1000).toFixed(0)}s`);

  let fullText = '';
  let timedOut = false;
  let activeRun: Run | undefined;
  const tokenUsageTracker = new TokenUsageAccumulator();
  const localOptions = buildLocalOptions(config);
  logger.info(`Sandbox read-only: ${localOptions.sandboxOptions.enabled ? 'ON' : 'OFF'}`);

  logAgentPromptBeforeSend(logger, options.prompt);

  // O SDK não aceita AbortSignal; o cancelamento correto de um run em andamento
  // é via run.cancel() (aborta stream + tool calls e faz run.wait() resolver
  // como 'cancelled'). Apenas parar de ler o stream não cancela o run no backend.
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    if (activeRun?.supports('cancel')) {
      void activeRun.cancel().catch(() => {
        /* cancelamento best-effort; o erro é tratado via flag timedOut */
      });
    }
  }, timeoutMs);

  const attempt = async (local: LocalAgentOptions): Promise<AgentRunResult> => {
    fullText = '';
    activeRun = undefined;
    tokenUsageTracker.reset();
    const agent = options.resumeAgentId
      ? await Agent.resume(options.resumeAgentId, {
          apiKey: config.cursorApiKey,
          model: modelSelection,
          local,
        })
      : await Agent.create({
          apiKey: config.cursorApiKey,
          name: options.name,
          model: modelSelection,
          local,
        });

    try {
      logger.info(`Agent ID: ${agent.agentId}`);

      const run = await agent.send(options.prompt, {
        onDelta: ({ update }) => {
          tokenUsageTracker.applyInteractionUpdate(update);
        },
      });
      activeRun = run;
      const runId = run.id ?? 'pending';
      logger.info(`Run ID: ${runId}`);

      let lastType: 'thinking' | 'assistant' | 'other' = 'other';

      for await (const event of run.stream()) {
        switch (event.type) {
          case 'assistant':
            for (const block of event.message.content) {
              if (block.type === 'text') {
                if (lastType !== 'assistant') {
                  if (lastType !== 'other') {
                    process.stdout.write('\n');
                  }
                  process.stdout.write(`[${new Date().toISOString()}] [INFO] [assistant] `);
                  lastType = 'assistant';
                }
                process.stdout.write(block.text);
                fullText += block.text;
              }
            }
            break;
          case 'tool_call':
            if (lastType !== 'other') {
              process.stdout.write('\n');
              lastType = 'other';
            }
            logger.info(
              `[tool] ${event.name} — ${event.status}` +
                (event.status === 'completed' ? '' : ` (${truncate(JSON.stringify(event.args), 120)})`),
            );
            break;
          case 'thinking':
            if (lastType !== 'thinking') {
              if (lastType !== 'other') {
                process.stdout.write('\n');
              }
              process.stdout.write(`[${new Date().toISOString()}] [INFO] [thinking] `);
              lastType = 'thinking';
            }
            process.stdout.write(event.text);
            break;
          case 'status':
            if (lastType !== 'other') {
              process.stdout.write('\n');
              lastType = 'other';
            }
            logger.info(`[status] ${event.status}${event.message ? `: ${event.message}` : ''}`);
            break;
          case 'system':
            logger.debug(`[system] agent=${event.agent_id} run=${event.run_id}`);
            break;
          default:
            break;
        }
      }

      if (lastType !== 'other') {
        process.stdout.write('\n');
      }

      const result = await run.wait();

      if (timedOut || result.status === 'cancelled') {
        throw new Error(
          `Timeout: agente excedeu ${(timeoutMs / 1000).toFixed(0)}s e o run foi cancelado. ` +
            'Aumente CURSOR_REVIEWER_TIMEOUT_MS se necessário.',
        );
      }

      if (result.status === 'error') {
        logger.error(`\n[DETALHES DO ERRO] Run result:\n${JSON.stringify(result, Object.getOwnPropertyNames(result), 2)}`);
        throw new Error(`Run falhou (id=${result.id}). Inspecione a saída verbosa acima.`);
      }

      logger.info('');
      logger.info(`Run concluído: ${result.status}`);

      const tokenUsage = tokenUsageTracker.getTotals();
      logger.section('Uso de tokens (SDK)');
      for (const line of formatTokenUsageSummary(tokenUsage)) {
        logger.info(line);
      }

      // `result.result` é a saída final canônica do run (string). Preferimos ela
      // ao texto acumulado do stream (sujeito a fragmentação/reordenação); só
      // caímos para `fullText` quando o backend não popula `result`.
      const finalText = result.result?.trim() ? result.result : fullText;

      return {
        agentId: agent.agentId,
        runId: result.id,
        status: result.status,
        fullText: finalText,
        tokenUsage,
      };
    } finally {
      await agent[Symbol.asyncDispose]();
    }
  };

  try {
    try {
      return await attempt(localOptions);
    } catch (error) {
      // Ambiente sem suporte a sandbox (ex.: agente de CI): cai para execução
      // sem sandbox. O contrato read-only segue garantido pelo SYSTEM_PROMPT.
      if (localOptions.sandboxOptions?.enabled && isSandboxUnsupportedError(error)) {
        logger.warn(
          'Sandbox local não suportado neste ambiente — reexecutando sem sandbox ' +
            '(read-only garantido via SYSTEM_PROMPT).',
        );
        return await attempt({ ...localOptions, sandboxOptions: { enabled: false } });
      }
      throw error;
    }
  } catch (error) {
    logger.error('\n[DETALHES DO ERRO FATAL - SDK/AGENT]');
    if (error instanceof Error) {
      logger.error(`Message: ${error.message}`);
      if (error.cause) logger.error(`Cause: ${error.cause}`);
      logger.error(`Stack: ${error.stack}`);
    }
    try {
      logger.error(`Raw Error Dump:\n${JSON.stringify(error, Object.getOwnPropertyNames(error), 2)}`);
    } catch {
      logger.error(`Raw Error Dump (fallback): ${String(error)}`);
    }

    if (error instanceof CursorAgentError) {
      logger.error(`Falha no agente: ${error.message} (retryable=${error.isRetryable})`);
      process.exitCode = 1;
      throw error;
    }
    process.exitCode = 1;
    throw error;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 3) + '...';
}
