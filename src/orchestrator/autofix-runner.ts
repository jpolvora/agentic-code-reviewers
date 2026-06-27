import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReviewerConfig } from '../config.js';
import type { ActiveThreadInfo, ReviewContextResult, ResolvedThreadItem } from '../ado/types.js';
import type { PlatformProvider } from '../provider/types.js';
import type { ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
import { extractJsonFromAgentOutput } from '../parser/review-response.js';
import { commitAutoFixChanges, isLocalAheadOfRemote, pushAutoFixChanges } from '../git/autofix-commit.js';
import { simulateThreadResolution } from '../ado/post-comments.js';

export interface Replacement {
  startLine: number;
  endLine: number;
  replacementContent: string;
}

const AUTOFIX_CONCURRENCY = 3;

export function validateReplacements(replacements: Replacement[]): void {
  for (const rep of replacements) {
    if (
      !Number.isInteger(rep.startLine) ||
      !Number.isInteger(rep.endLine) ||
      rep.startLine < 1 ||
      rep.endLine < rep.startLine
    ) {
      throw new Error(`Intervalo inválido: ${rep.startLine}-${rep.endLine}`);
    }
  }
}

export function assertNonOverlapping(replacements: Replacement[]): void {
  const sorted = [...replacements].sort((a, b) => a.startLine - b.startLine);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].startLine <= sorted[i - 1].endLine) {
      throw new Error(
        `Replacements sobrepostos: ${sorted[i - 1].startLine}-${sorted[i - 1].endLine} e ${sorted[i].startLine}-${sorted[i].endLine}`,
      );
    }
  }
}

export function applyReplacements(content: string, replacements: Replacement[]): string {
  validateReplacements(replacements);
  assertNonOverlapping(replacements);
  const lines = content.split(/\r?\n/);
  const hasCarriageReturn = content.includes('\r\n');
  const separator = hasCarriageReturn ? '\r\n' : '\n';

  // Ordena substituições de baixo para cima para evitar deslocamento de linhas superiores
  const sorted = [...replacements].sort((a, b) => b.startLine - a.startLine);

  for (const rep of sorted) {
    const startIdx = rep.startLine - 1;
    const endIdx = rep.endLine - 1;

    if (startIdx < 0 || endIdx >= lines.length || startIdx > endIdx) {
      throw new Error(
        `Substituição fora dos limites: linhas ${rep.startLine}-${rep.endLine} em arquivo de ${lines.length} linhas`,
      );
    }

    const repLines = rep.replacementContent.split(/\r?\n/);
    lines.splice(startIdx, endIdx - startIdx + 1, ...repLines);
  }

  return lines.join(separator);
}

export function computeUpdatedLineNumber(originalLine: number, replacements: Replacement[]): number {
  const sorted = [...replacements].sort((a, b) => a.startLine - b.startLine);
  let mapped = originalLine;

  for (const rep of sorted) {
    if (originalLine < rep.startLine) break;

    if (originalLine <= rep.endLine) {
      const offset = originalLine - rep.startLine;
      const repStartMapped =
        rep.startLine +
        sorted
          .filter((r) => r.startLine < rep.startLine)
          .reduce(
            (acc, r) => acc + r.replacementContent.split(/\r?\n/).length - (r.endLine - r.startLine + 1),
            0,
          );
      const newSpan = rep.replacementContent.split(/\r?\n/).length;
      return repStartMapped + Math.min(offset, Math.max(newSpan - 1, 0));
    }

    mapped += rep.replacementContent.split(/\r?\n/).length - (rep.endLine - rep.startLine + 1);
  }

  return mapped;
}

export function isThreadLineModified(
  fileContent: string,
  updatedContent: string,
  threadLineNumber: number,
  replacements: Replacement[],
): boolean {
  const inRange = replacements.some(
    (rep) => threadLineNumber >= rep.startLine && threadLineNumber <= rep.endLine,
  );
  if (!inRange) return false;

  const origLines = fileContent.split(/\r?\n/);
  const updatedLines = updatedContent.split(/\r?\n/);
  const origLine = origLines[threadLineNumber - 1];
  if (origLine === undefined) return false;

  const mappedLine = computeUpdatedLineNumber(threadLineNumber, replacements);
  const updatedLine = updatedLines[mappedLine - 1];
  if (updatedLine === undefined) return true;

  return origLine !== updatedLine;
}

interface AutoFixAgentResponse {
  replacements: Replacement[];
  resolvedThreads?: Array<{ threadId: string | number; explanation: string }>;
  /** @deprecated use resolvedThreads[].explanation */
  explanation?: string;
}

function buildResolvedItemsFromAgent(
  threads: ActiveThreadInfo[],
  parsed: AutoFixAgentResponse,
  dryRun: boolean,
): ResolvedThreadItem[] {
  const items: ResolvedThreadItem[] = [];

  if (parsed.resolvedThreads && parsed.resolvedThreads.length > 0) {
    for (const entry of parsed.resolvedThreads) {
      const thread = threads.find((t) => String(t.threadId) === String(entry.threadId));
      if (!thread) continue;
      const note = entry.explanation?.trim();
      if (!note) continue;
      items.push({
        threadId: Number.isNaN(Number(thread.threadId)) ? thread.threadId : Number(thread.threadId),
        fileName: thread.filePath,
        lineNumber: thread.lineNumber,
        note: dryRun ? `${note} (simulado)` : note,
      });
    }
    return items;
  }

  const fallbackNote = parsed.explanation?.trim();
  if (!fallbackNote) return items;

  for (const thread of threads) {
    items.push({
      threadId: Number.isNaN(Number(thread.threadId)) ? thread.threadId : Number(thread.threadId),
      fileName: thread.filePath,
      lineNumber: thread.lineNumber,
      note: dryRun ? `${fallbackNote} (simulado)` : fallbackNote,
    });
  }
  return items;
}

interface FileFixResult {
  relativePath: string;
  resolvedItems: ResolvedThreadItem[];
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R | undefined>,
): Promise<R[]> {
  const queue = [...items];
  const buckets = await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      const local: R[] = [];
      while (queue.length) {
        const item = queue.shift();
        if (item === undefined) continue;
        const result = await fn(item);
        if (result !== undefined) local.push(result);
      }
      return local;
    }),
  );
  return buckets.flat();
}

/** Dual-engine sequencial: publica commit deixado pelo engine anterior quando threads já foram resolvidas. */
async function tryRecoverPendingPush(config: ReviewerConfig, logger: Logger): Promise<void> {
  if (config.dryRun || !isLocalAheadOfRemote(config.repoRoot)) {
    return;
  }

  logger.section('Recovery: publicando commit pendente do engine anterior');
  const pushed = await pushAutoFixChanges(config, logger);
  if (!pushed) {
    throw new Error(
      'Recovery dual-engine: falha ao publicar commit local pendente (threads já resolvidas por engine anterior).',
    );
  }
}

export function getAutoFixThreads(reviewContext: ReviewContextResult): ActiveThreadInfo[] {
  return reviewContext.fileReviewThreads;
}

export async function runAutoFixFlow(
  config: ReviewerConfig,
  reviewContext: ReviewContextResult,
  provider: PlatformProvider,
  engine: ExecutionEngine,
  logger: Logger,
): Promise<void> {
  const activeThreads = getAutoFixThreads(reviewContext);
  if (activeThreads.length === 0) {
    logger.info('Nenhuma thread de review aberta (com arquivo/linha) para correção automática.');
    await tryRecoverPendingPush(config, logger);
    return;
  }

  logger.info(`Total de threads ativas encontradas: ${activeThreads.length}`);

  // Agrupa as threads por arquivo
  const threadsByFile = new Map<string, ActiveThreadInfo[]>();
  for (const thread of activeThreads) {
    if (!thread.filePath) continue;
    const list = threadsByFile.get(thread.filePath) || [];
    list.push(thread);
    threadsByFile.set(thread.filePath, list);
  }

  logger.info(`Arquivos a serem corrigidos: ${threadsByFile.size}`);

  // Carrega o prompt de AUTO_FIX
  const autoFixPromptPath = path.resolve(config.runnerRoot, 'skills', 'AUTO_FIX.md');
  if (!fs.existsSync(autoFixPromptPath)) {
    throw new Error(`Prompt do Auto-Fix não encontrado em: ${autoFixPromptPath}`);
  }
  const autoFixSystemPrompt = fs.readFileSync(autoFixPromptPath, 'utf8');

  const resolvedItems: ResolvedThreadItem[] = [];
  const modifiedFiles: string[] = [];
  const filePaths = Array.from(threadsByFile.keys());

  const fileResults = await mapPool(filePaths, AUTOFIX_CONCURRENCY, async (filePath) => {
      const threads = threadsByFile.get(filePath)!;
      const relativePath = filePath.replace(/^\/+/,'');
      const fullFilePath = path.resolve(config.repoRoot, relativePath);

      // Validação de segurança contra Directory Traversal
      const rel = path.relative(path.resolve(config.repoRoot), fullFilePath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        logger.error(`Acesso fora do repositório bloqueado: ${filePath}`);
        return undefined;
      }

      if (!fs.existsSync(fullFilePath)) {
        logger.error(`Arquivo não encontrado para correção: ${filePath} (caminho resolvido: ${fullFilePath})`);
        return undefined;
      }

      const fileContent = fs.readFileSync(fullFilePath, 'utf8');
      const threadListText = threads
        .map(
          (t) =>
            `### Thread ${t.threadId} (linha ${t.lineNumber})\n${t.description || t.summary}`,
        )
        .join('\n\n');

      const prompt = `${autoFixSystemPrompt}

---
## Arquivo a ser modificado:
Caminho: ${filePath}

Conteúdo Atual do Arquivo:
\`\`\`
${fileContent}
\`\`\`

---
## Threads abertas neste arquivo (analise cada descrição em profundidade):
${threadListText}

Retorne o JSON com \`replacements\` e \`resolvedThreads\` (explicação detalhada por thread corrigida).
`;

      logger.info(`Disparando subagente de correção para o arquivo: ${filePath}`);
      try {
        const result = await engine.run(
          config,
          {
            name: `autofix-${path.basename(filePath)}`,
            prompt,
          },
          logger,
        );

        const jsonText = extractJsonFromAgentOutput(result.fullText);
        if (!jsonText) {
          logger.error(`Falha ao extrair JSON da resposta do agente para o arquivo: ${filePath}`);
          return undefined;
        }

        const parsed = JSON.parse(jsonText) as AutoFixAgentResponse;

        if (!parsed.replacements || !Array.isArray(parsed.replacements)) {
          logger.error(`Formato de replacements inválido retornado para o arquivo: ${filePath}`);
          return undefined;
        }

        if (parsed.replacements.length === 0) {
          logger.warn(`Nenhuma substituição retornada para o arquivo: ${filePath}.`);
          return undefined;
        }

        let updatedContent: string;
        try {
          updatedContent = applyReplacements(fileContent, parsed.replacements);
        } catch (err: any) {
          logger.error(`Erro ao aplicar substituições em ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
          return undefined;
        }

        if (updatedContent === fileContent) {
          logger.warn(`Substituições idempotentes retornadas para o arquivo: ${filePath}.`);
          return undefined;
        }

        const localResolvedItems = buildResolvedItemsFromAgent(threads, parsed, config.dryRun);

        if (localResolvedItems.length === 0) {
          logger.warn(
            `Arquivo ${filePath} alterado mas nenhuma thread listada em resolvedThreads — correção descartada.`,
          );
          return undefined;
        }

        if (config.dryRun) {
          logger.info(`[dry-run] Simulando ${parsed.replacements.length} substituição(ões) em ${filePath}.`);
        } else {
          logger.info(`Aplicando correções no arquivo local: ${filePath}`);
          fs.writeFileSync(fullFilePath, updatedContent, 'utf8');
        }

        return { relativePath, resolvedItems: localResolvedItems };
      } catch (err: any) {
        logger.error(`Erro ao executar correção para o arquivo ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
        return undefined;
      }
  });

  for (const result of fileResults) {
    modifiedFiles.push(result.relativePath);
    resolvedItems.push(...result.resolvedItems);
  }

  if (resolvedItems.length === 0) {
    logger.info('Nenhuma correção foi aplicada com sucesso.');
    return;
  }

  // commit local → fechar threads com explicação detalhada → push
  logger.section('Consolidando alterações com Git (commit local)');
  const commitSuccess = await commitAutoFixChanges(config, logger, modifiedFiles);
  if (!commitSuccess) {
    logger.info('Commit local não realizado; abortando resolução e push.');
    return;
  }

  logger.section('Fechando threads corrigidas na PR');
  if (config.dryRun) {
    logger.info(`[dry-run] Simulando resolução de ${resolvedItems.length} thread(s).`);
    simulateThreadResolution(activeThreads, reviewContext.pendingThreads ?? [], resolvedItems);
  } else {
    const resolvedCount = await provider.resolvePullRequestReviewThreads(
      config.botTag,
      activeThreads,
      resolvedItems,
      (msg) => logger.info(msg),
    );
    logger.info(`Total de threads resolvidas: ${resolvedCount}/${resolvedItems.length}`);

    if (resolvedCount < resolvedItems.length) {
      logger.warn(
        'Gate cooperativo: resolução incompleta — push abortado. Commit local preservado; ' +
          'corrija token/permissões ou resolva manualmente (skill solve-pr).',
      );
      return;
    }
  }

  logger.section('Push das alterações (após resolução)');
  const pushed = await pushAutoFixChanges(config, logger);
  if (!pushed) {
    throw new Error(
      'Gate cooperativo: push falhou após resolução de threads — PR e remoto podem estar inconsistentes.',
    );
  }
}


