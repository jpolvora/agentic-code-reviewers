import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import type { ReviewerConfig } from '../config.js';
import type { ActiveThreadInfo, ReviewContextResult, ResolvedThreadItem } from '../ado/types.js';
import type { PlatformProvider } from '../provider/types.js';
import type { ExecutionEngine } from '../engine/types.js';
import type { Logger } from '../logger.js';
import { extractJsonFromAgentOutput } from '../parser/review-response.js';
import { commitAutoFixChanges, isLocalAheadOfRemote, pushAutoFixChanges } from '../git/autofix-commit.js';
import { runAutoFixBuild } from '../git/autofix-build.js';
import { simulateThreadResolution } from '../ado/post-comments.js';
import { AUTO_FIX_SUMMARY_MARKER } from '../git/markers.js';
import { isAgenticReviewerComment, stripAgenticBotTags } from '../bot-tag.js';

export interface Replacement {
  startLine: number;
  endLine: number;
  replacementContent: string;
}

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
}

function buildResolvedItemsFromAgent(
  threads: ActiveThreadInfo[],
  parsed: AutoFixAgentResponse,
  dryRun: boolean,
): ResolvedThreadItem[] {
  const items: ResolvedThreadItem[] = [];

  if (!parsed.resolvedThreads || parsed.resolvedThreads.length === 0) {
    return items;
  }

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


interface FileFixResult {
  relativePath: string;
  resolvedItems: ResolvedThreadItem[];
}

/** Dual-engine sequencial: publica commit deixado pelo engine anterior quando threads já foram resolvidas. */
async function tryRecoverPendingPush(
  config: ReviewerConfig,
  reviewContext: ReviewContextResult,
  provider: PlatformProvider,
  logger: Logger,
): Promise<void> {
  if (config.dryRun || !isLocalAheadOfRemote(config.repoRoot)) {
    return;
  }

  logger.section('Recovery: validando build antes de publicar commit pendente');
  const buildOk = await runAutoFixBuild(config, logger);
  if (!buildOk) {
    throw new Error(
      'Recovery dual-engine: build falhou — push do commit local pendente abortado.',
    );
  }

  logger.section('Recovery: publicando commit pendente do engine anterior');
  const pushed = await pushAutoFixChanges(config, logger);
  if (!pushed) {
    throw new Error(
      'Recovery dual-engine: falha ao publicar commit local pendente (threads já resolvidas por engine anterior).',
    );
  }

  const subject = getHeadCommitSubject(config.repoRoot);
  const threadIds = parseAutoFixCommitThreadIds(subject);
  if (threadIds !== null) {
    const summary = buildRecoverySummary(
      getHeadCommitChangedFiles(config.repoRoot),
      threadIds,
    );
    await postAutoFixSummary(config, reviewContext, provider, summary, logger);
  }
}

export function parseAutoFixCommitThreadIds(subject: string): string[] | null {
  if (!subject.includes('auto-fix issues from review threads')) {
    return null;
  }
  const match = subject.match(/\[(.+)\]\s*$/);
  if (!match) return [];
  return match[1].split(',').map((s) => s.trim()).filter(Boolean);
}

function getHeadCommitSubject(repoRoot: string): string {
  return execSync('git log -1 --format=%s', { cwd: repoRoot, encoding: 'utf8' }).trim();
}

function getHeadCommitChangedFiles(repoRoot: string): string[] {
  const out = execSync('git show --name-only --pretty=format: HEAD', {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim();
  if (!out) return [];
  return out.split(/\r?\n/).filter((line) => line.length > 0);
}

function formatCommonAutoFixSections(modifiedFiles: string[]): string[] {
  const lines: string[] = [];
  if (modifiedFiles.length > 0) {
    lines.push('### Files Changed');
    for (const file of modifiedFiles) {
      lines.push(`- \`${file}\``);
    }
    lines.push('');
  }
  lines.push('> A new code review round will be triggered automatically to validate the changes.');
  return lines;
}

export function buildRecoverySummary(modifiedFiles: string[], threadIds: string[]): string {
  const fixCount = threadIds.length > 0 ? threadIds.length : modifiedFiles.length > 0 ? 1 : 0;
  const lines: string[] = [];
  lines.push(AUTO_FIX_SUMMARY_MARKER);
  lines.push('');
  lines.push('## Auto-Fix Summary');
  lines.push('');
  lines.push(
    '> Published by the dual-engine recovery path after a prior engine committed and resolved threads but failed to push.',
  );
  lines.push('');
  lines.push(
    `The auto-fix workflow successfully applied **${fixCount} fix(es)** across **${modifiedFiles.length} file(s)**.`,
  );
  lines.push('');

  if (threadIds.length > 0) {
    lines.push('### Resolved Threads');
    for (const id of threadIds) {
      lines.push(`- \`${id}\``);
    }
    lines.push('');
  }

  lines.push(...formatCommonAutoFixSections(modifiedFiles));
  return lines.join('\n');
}

async function postAutoFixSummary(
  config: ReviewerConfig,
  reviewContext: ReviewContextResult,
  provider: PlatformProvider,
  summary: string,
  logger: Logger,
): Promise<void> {
  logger.section('Publicando sumário do auto-fix na PR');
  if (config.dryRun) {
    logger.info(`[dry-run] Sumário do auto-fix seria publicado:\n${summary}`);
    return;
  }
  if (testAutoFixSummaryAlreadyPosted(reviewContext, config.botTag, summary)) {
    logger.info('Auto-fix summary já publicado anteriormente — pulando duplicata.');
    return;
  }
  const posted = await provider.postPrComment(config.botTag, summary, (msg) => logger.info(msg));
  if (!posted) {
    logger.warn(
      'Auto-fix push/resolução concluídos, mas falha ao publicar sumário na PR — push já foi bem-sucedido.',
    );
  } else {
    logger.info('Sumário do auto-fix publicado na PR.');
  }
}

export function getAutoFixThreads(reviewContext: ReviewContextResult): ActiveThreadInfo[] {
  return reviewContext.fileReviewThreads;
}

function buildThreadUrl(
  config: ReviewerConfig,
  thread: ActiveThreadInfo,
): string {
  if (config.provider === 'github') {
    return `https://github.com/${config.organization}/${config.repositoryName}/pull/${config.pullRequestId}#discussion_r${thread.botCommentId}`;
  }
  const org = encodeURIComponent(config.organization);
  const project = encodeURIComponent(config.project);
  const repo = encodeURIComponent(config.repositoryName);
  return `https://dev.azure.com/${org}/${project}/_git/${repo}/pullrequest/${config.pullRequestId}?threadId=${thread.threadId}`;
}

function buildAutoFixSummary(
  config: ReviewerConfig,
  resolvedItems: ResolvedThreadItem[],
  activeThreads: ActiveThreadInfo[],
  modifiedFiles: string[],
): string {
  const resolvedWithThreads = resolvedItems
    .map((item) => {
      const thread = activeThreads.find(
        (t) => String(t.threadId) === String(item.threadId),
      );
      return { item, thread };
    })
    .filter((x) => x.thread != null);

  const lines: string[] = [];
  lines.push(AUTO_FIX_SUMMARY_MARKER);
  lines.push('');
  lines.push('## Auto-Fix Summary');
  lines.push('');
  lines.push(
    `The auto-fix workflow successfully applied **${resolvedWithThreads.length} fix(es)** across **${modifiedFiles.length} file(s)**.`,
  );
  lines.push('');

  if (resolvedWithThreads.length > 0) {
    lines.push('### Resolved Issues');
    lines.push('');
    lines.push('| # | File | Line | Thread | Resolution |');
    lines.push('|---|------|------|--------|------------|');
    let idx = 0;
    for (const { item, thread } of resolvedWithThreads) {
      idx++;
      const url = buildThreadUrl(config, thread!);
      const file = (thread!.filePath || '').replace(/^\/+/, '');
      const resolution = (item.note || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(
        `| ${idx} | \`${file}\` | ${thread!.lineNumber} | [discussion](${url}) | ${resolution} |`,
      );
    }
    lines.push('');
  }

  lines.push(...formatCommonAutoFixSections(modifiedFiles));
  return lines.join('\n');
}

function normalizeAutoFixSummaryBody(text: string): string {
  let body = stripAgenticBotTags(text);
  body = body.replace(AUTO_FIX_SUMMARY_MARKER, '');
  return body.replace(/\s+/g, ' ').trim();
}

export function testAutoFixSummaryAlreadyPosted(
  reviewContext: ReviewContextResult,
  _botTag: string,
  summaryText: string,
): boolean {
  const threads = reviewContext.allThreads;
  if (!threads) return false;

  const normalizedSummary = normalizeAutoFixSummaryBody(summaryText);

  for (const thread of threads.value) {
    if (thread.threadContext?.filePath) continue;

    for (const comment of thread.comments) {
      if (comment.isDeleted || !isAgenticReviewerComment(comment.content)) continue;
      if (!comment.content.includes(AUTO_FIX_SUMMARY_MARKER)) continue;

      if (normalizeAutoFixSummaryBody(comment.content) === normalizedSummary) {
        return true;
      }
    }
  }
  return false;
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
    await tryRecoverPendingPush(config, reviewContext, provider, logger);
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
  const fileResults: FileFixResult[] = [];

  for (const filePath of filePaths) {
    const threads = threadsByFile.get(filePath)!;
    const relativePath = filePath.replace(/^\/+/, '');
    const fullFilePath = path.resolve(config.repoRoot, relativePath);

    // Validação de segurança contra Directory Traversal
    const rel = path.relative(path.resolve(config.repoRoot), fullFilePath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      logger.error(`Acesso fora do repositório bloqueado: ${filePath}`);
      continue;
    }

    if (!fs.existsSync(fullFilePath)) {
      logger.error(`Arquivo não encontrado para correção: ${filePath} (caminho resolvido: ${fullFilePath})`);
      continue;
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
        continue;
      }

      const parsed = JSON.parse(jsonText) as AutoFixAgentResponse;

      if (!parsed.replacements || !Array.isArray(parsed.replacements)) {
        logger.error(`Formato de replacements inválido retornado para o arquivo: ${filePath}`);
        continue;
      }

      if (parsed.replacements.length === 0) {
        logger.warn(`Nenhuma substituição retornada para o arquivo: ${filePath}.`);
        continue;
      }

      let updatedContent: string;
      try {
        updatedContent = applyReplacements(fileContent, parsed.replacements);
      } catch (err: any) {
        logger.error(`Erro ao aplicar substituições em ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
        continue;
      }

      if (updatedContent === fileContent) {
        logger.warn(`Substituições idempotentes retornadas para o arquivo: ${filePath}.`);
        continue;
      }

      const localResolvedItems = buildResolvedItemsFromAgent(threads, parsed, config.dryRun);

      const verifiedResolvedItems = localResolvedItems.filter((item) => {
        const thread = threads.find(
          (t) =>
            (Number.isNaN(Number(item.threadId)) ? item.threadId : Number(item.threadId)) ===
            (Number.isNaN(Number(t.threadId)) ? t.threadId : Number(t.threadId)),
        );
        if (!thread) return false;
        if (
          !isThreadLineModified(fileContent, updatedContent, thread.lineNumber, parsed.replacements)
        ) {
          logger.warn(
            `Thread ${thread.threadId} declarada resolvida mas linha ${thread.lineNumber} não foi alterada — ignorada.`,
          );
          return false;
        }
        return true;
      });

      if (verifiedResolvedItems.length === 0) {
        logger.warn(
          `Arquivo ${filePath} alterado mas nenhuma thread confirmada após verificação determinística — correção descartada.`,
        );
        continue;
      }

      if (config.dryRun) {
        logger.info(`[dry-run] Simulando ${parsed.replacements.length} substituição(ões) em ${filePath}.`);
      } else {
        logger.info(`Aplicando correções no arquivo local: ${filePath}`);
        fs.writeFileSync(fullFilePath, updatedContent, 'utf8');
      }

      fileResults.push({ relativePath, resolvedItems: verifiedResolvedItems });
    } catch (err: any) {
      logger.error(`Erro ao executar correção para o arquivo ${filePath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  for (const result of fileResults) {
    modifiedFiles.push(result.relativePath);
    resolvedItems.push(...result.resolvedItems);
  }

  if (resolvedItems.length === 0) {
    logger.info('Nenhuma correção foi aplicada com sucesso.');
    return;
  }

  // commit local → build → fechar threads com explicação detalhada → push
  logger.section('Consolidando alterações com Git (commit local)');
  const resolvedThreadIds = resolvedItems.map((item) => String(item.threadId));
  const commitSuccess = await commitAutoFixChanges(config, logger, modifiedFiles, resolvedThreadIds);
  if (!commitSuccess) {
    logger.info('Commit local não realizado; abortando build, resolução e push.');
    return;
  }

  logger.section('Validando build após commit local');
  const buildOk = await runAutoFixBuild(config, logger);
  if (!buildOk) {
    throw new Error(
      'Gate cooperativo: build falhou após commit local — resolução e push abortados.',
    );
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

  const summary = buildAutoFixSummary(config, resolvedItems, activeThreads, modifiedFiles);
  await postAutoFixSummary(config, reviewContext, provider, summary, logger);
}


