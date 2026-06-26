import { isAzurePipeline } from '../ado/pipeline-logging.js';
import type { Logger } from '../logger.js';

export const PROMPT_START_MARKER = 'Inicio Prompt:';
export const PROMPT_END_MARKER = 'Fim do prompt';

const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  magenta: '\u001b[35m',
} as const;

/** True quando cores ANSI podem ser emitidas (terminal local ou pipeline ADO). */
export function useAnsiColors(): boolean {
  if (process.env.NO_COLOR?.trim()) {
    return false;
  }
  if (process.env.FORCE_COLOR?.trim()) {
    return true;
  }
  if (isAzurePipeline()) {
    // Agentes ADO recentes renderizam ANSI; desligável via env.
    return process.env.CURSOR_REVIEWER_PROMPT_COLOR?.trim().toLowerCase() !== 'false';
  }
  return process.stdout.isTTY === true;
}

/** Destaca cabeçalhos markdown e separadores do prompt para leitura humana. */
export function colorizePromptForDisplay(prompt: string, color: boolean): string {
  if (!color) {
    return prompt;
  }

  return prompt
    .split('\n')
    .map((line) => {
      if (/^#{1,3} /.test(line)) {
        return `${ANSI.bold}${ANSI.cyan}${line}${ANSI.reset}`;
      }
      if (/^---+$/.test(line.trim())) {
        return `${ANSI.dim}${line}${ANSI.reset}`;
      }
      if (/^> /.test(line)) {
        return `${ANSI.dim}${line}${ANSI.reset}`;
      }
      if (/^\*\*[^*]+\*\*/.test(line)) {
        return `${ANSI.yellow}${line}${ANSI.reset}`;
      }
      return line;
    })
    .join('\n');
}

function formatMeta(prompt: string): string {
  const chars = prompt.length;
  const lines = prompt.split('\n').length;
  return `${chars.toLocaleString('pt-BR')} caracteres · ${lines.toLocaleString('pt-BR')} linhas`;
}

function formatBanner(label: string, meta: string, color: boolean): string {
  const title = `${label} ${meta}`;
  const border = '═'.repeat(Math.min(Math.max(title.length + 4, 48), 80));
  if (!color) {
    return `${border}\n  ${title}\n${border}`;
  }
  return (
    `${ANSI.bold}${ANSI.magenta}${border}${ANSI.reset}\n` +
    `${ANSI.bold}${ANSI.green}  ${label}${ANSI.reset} ${ANSI.dim}${meta}${ANSI.reset}\n` +
    `${ANSI.bold}${ANSI.magenta}${border}${ANSI.reset}`
  );
}

function formatPromptFooter(color: boolean): string {
  const line = '─'.repeat(48);
  if (!color) {
    return `\n${line}\n  ${PROMPT_END_MARKER}\n${line}`;
  }
  return (
    `\n${ANSI.dim}${line}${ANSI.reset}\n` +
    `${ANSI.bold}${ANSI.green}  ${PROMPT_END_MARKER}${ANSI.reset}\n` +
    `${ANSI.dim}${line}${ANSI.reset}`
  );
}

/**
 * Emite o prompt completo imediatamente antes do envio ao Cursor SDK.
 *
 * - **Azure Pipelines:** seção colapsável `##[group]` / `##[endgroup]` + ANSI opcional.
 * - **Terminal local:** banners coloridos + corpo com destaque de seções markdown.
 */
export function logAgentPromptBeforeSend(logger: Logger, prompt: string): void {
  const meta = formatMeta(prompt);
  const color = useAnsiColors();
  const body = colorizePromptForDisplay(prompt, color);

  if (isAzurePipeline()) {
    console.log(`##[group]${PROMPT_START_MARKER} ${meta}`);
    console.log(body);
    console.log(formatPromptFooter(color));
    console.log('##[endgroup]');
    logger.info(`${PROMPT_END_MARKER} (${meta}) — prompt completo no grupo colapsável acima`);
    return;
  }

  logger.info(formatBanner(PROMPT_START_MARKER, meta, color));
  console.log(body);
  logger.info(formatBanner(PROMPT_END_MARKER, meta, color));
}
