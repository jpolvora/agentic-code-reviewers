import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ReviewerConfig } from '../config.js';
import type { ActiveThreadInfo, ReviewContextResult, ResolvedThreadItem } from '../ado/types.js';
import type { PlatformProvider } from '../provider/types.js';
import type { ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
import { extractJsonFromAgentOutput } from '../parser/review-response.js';
import { runAutoFixCommit } from '../git/autofix-commit.js';
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

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item !== undefined) await fn(item);
      }
    }),
  );
}

export async function runAutoFixFlow(
  config: ReviewerConfig,
  reviewContext: ReviewContextResult,
  provider: PlatformProvider,
  engine: ExecutionEngine,
  logger: Logger,
): Promise<void> {
  const activeThreads = reviewContext.activeThreads || [];
  if (activeThreads.length === 0) {
    logger.info('Nenhuma thread ativa/aberta para correção automática.');
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

  await mapPool(filePaths, AUTOFIX_CONCURRENCY, async (filePath) => {
      const threads = threadsByFile.get(filePath)!;
      const relativePath = filePath.replace(/^\/+/,'');
      const fullFilePath = path.resolve(config.repoRoot, relativePath);

      // Validação de segurança contra Directory Traversal
      const rel = path.relative(path.resolve(config.repoRoot), fullFilePath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        logger.error(`Acesso fora do repositório bloqueado: ${filePath}`);
        return;
      }

      if (!fs.existsSync(fullFilePath)) {
        logger.error(`Arquivo não encontrado para correção: ${filePath} (caminho resolvido: ${fullFilePath})`);
        return;
      }

      const fileContent = fs.readFileSync(fullFilePath, 'utf8');
      const threadListText = threads
        .map((t) => `- Linha ${t.lineNumber}: ${t.summary}`)
        .join('\n');

      const prompt = `${autoFixSystemPrompt}

---
## Arquivo a ser modificado:
Caminho: ${filePath}

Conteúdo Atual do Arquivo:
\`\`\`
${fileContent}
\`\`\`

---
## Threads de revisão ativas:
${threadListText}

Por favor, analise as threads acima e retorne o JSON com a explicação e as substituições (replacements) necessárias para corrigir todos os problemas apontados para este arquivo.
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
          return;
        }

        const parsed = JSON.parse(jsonText) as {
          explanation: string;
          replacements: Array<{ startLine: number; endLine: number; replacementContent: string }>;
        };

        if (!parsed.replacements || !Array.isArray(parsed.replacements)) {
          logger.error(`Formato de replacements inválido retornado para o arquivo: ${filePath}`);
          return;
        }

        if (parsed.replacements.length === 0) {
          logger.warn(`Nenhuma substituição retornada para o arquivo: ${filePath}. Threads não serão resolvidas.`);
          return;
        }

        let updatedContent: string;
        try {
          updatedContent = applyReplacements(fileContent, parsed.replacements);
        } catch (err: any) {
          logger.error(`Erro ao aplicar substituições em ${filePath}: ${err.message}`);
          return;
        }

        if (updatedContent === fileContent) {
          logger.warn(`Substituições idempotentes retornadas para o arquivo: ${filePath}. Threads não serão resolvidas.`);
          return;
        }

        const explanation = parsed.explanation || 'Issue corrigida automaticamente pelo subagente.';
        
        if (config.dryRun) {
          logger.info(`[dry-run] Simulando ${parsed.replacements.length} substituição(ões) em ${filePath}.`);
        } else {
          logger.info(`Aplicando correções no arquivo local: ${filePath}`);
          fs.writeFileSync(fullFilePath, updatedContent, 'utf8');
        }

        modifiedFiles.push(relativePath);

        // Cria os itens resolvidos para marcar na PR apenas se a thread tiver sido de fato alterada pelos replacements
        for (const thread of threads) {
          const isModified = parsed.replacements.some(
            (rep) => thread.lineNumber >= rep.startLine && thread.lineNumber <= rep.endLine,
          );

          if (isModified) {
            resolvedItems.push({
              threadId: Number.isNaN(Number(thread.threadId)) ? thread.threadId : Number(thread.threadId),
              fileName: thread.filePath,
              lineNumber: thread.lineNumber,
              note: config.dryRun ? `${explanation} (simulado)` : explanation,
            });
          } else {
            logger.warn(
              `Thread ${thread.threadId} na linha ${thread.lineNumber} de ${filePath} não foi afetada pelas substituições e continuará aberta.`,
            );
          }
        }
      } catch (err: any) {
        logger.error(`Erro ao executar correção para o arquivo ${filePath}: ${err.message}`);
      }
  });

  if (resolvedItems.length === 0) {
    logger.info('Nenhuma correção foi aplicada com sucesso.');
    return;
  }

  // Consolidar commit e push
  logger.section('Consolidando alterações com Git');
  const commitSuccess = await runAutoFixCommit(config, logger, modifiedFiles);

  // Responder e resolver threads na PR
  logger.section('Respondendo e resolvendo threads na PR');
  if (config.dryRun) {
    logger.info(`[dry-run] Simulando resolução de ${resolvedItems.length} thread(s).`);
    simulateThreadResolution(activeThreads, reviewContext.pendingThreads ?? [], resolvedItems);
  } else if (commitSuccess) {
    const resolvedCount = await provider.resolvePullRequestReviewThreads(
      config.botTag,
      activeThreads,
      resolvedItems,
      (msg) => logger.info(msg),
    );
    logger.info(`Total de threads resolvidas: ${resolvedCount}`);
  } else {
    logger.info('Commit não realizado; abortando resolução de threads.');
  }
}
