import { AdoClient } from './client.js';
import {
  commentHasBotTag,
  normalizeFilePath,
  stripHtml,
} from './utils.js';
import {
  REVIEW_SUMMARY_MARKER,
  commentBodyHasResolutionReply,
} from '../git/markers.js';
import type {
  ActiveThreadInfo,
  AdoThread,
  AdoThreadsResponse,
  PendingPrThread,
  ReviewContextResult,
} from './types.js';

export function getReviewSummaryFromComment(content: string, botTag: string): string {
  let summary = content.replace(/<details>[\s\S]*?<\/details>/gi, '');
  summary = summary.replace(/```[\s\S]*?```/g, '');
  summary = summary.replaceAll(botTag, '');
  summary = stripHtml(summary);
  summary = summary.replace(/\s+/g, ' ').trim();
  if (summary.length > 160) {
    return summary.slice(0, 157) + '...';
  }
  return summary;
}

function threadHasResolutionReply(thread: { comments: Array<{ content: string; isDeleted?: boolean; parentCommentId: number }> }, botTag: string): boolean {
  return thread.comments.some(
    (comment) =>
      !comment.isDeleted &&
      comment.parentCommentId !== 0 &&
      commentHasBotTag(comment.content, botTag, 'contains') &&
      commentBodyHasResolutionReply(comment.content, botTag),
  );
}

function getFirstVisibleComment(thread: AdoThread) {
  return thread.comments.find((comment) => !comment.isDeleted && comment.commentType === 1);
}

function extractPendingThreads(threads: AdoThreadsResponse, botTag: string): PendingPrThread[] {
  const pending: PendingPrThread[] = [];

  for (const thread of threads.value) {
    if (thread.isDeleted) {
      continue;
    }

    const status = String(thread.status ?? '').toLowerCase();
    if (status !== 'active' && status !== 'pending') {
      continue;
    }

    const firstComment = getFirstVisibleComment(thread);
    if (!firstComment) {
      continue;
    }

    const rawContent = firstComment.content;
    const isBot = commentHasBotTag(rawContent, botTag, 'contains');
    const detectedBotTag = isBot ? botTag : null;
    const summary = getReviewSummaryFromComment(rawContent, botTag);

    pending.push({
      threadId: String(thread.id),
      status,
      filePath: thread.threadContext?.filePath ?? null,
      lineNumber: thread.threadContext?.rightFileStart?.line ?? null,
      author: firstComment.author?.displayName ?? 'unknown',
      isBot,
      botTag: detectedBotTag,
      summary: summary || stripHtml(rawContent).replace(/\s+/g, ' ').slice(0, 160),
    });
  }

  return pending;
}

export function filterGatePendingThreads(threads: PendingPrThread[], botTag: string): PendingPrThread[] {
  return threads.filter((t) => t.isBot && t.botTag === botTag);
}

export async function getPullRequestReviewContext(
  client: AdoClient,
  pullRequestId: number,
  botTag: string,
  log: (msg: string) => void,
): Promise<ReviewContextResult> {
  try {
    const existingThreads = await client.get<AdoThreadsResponse>(
      `/pullRequests/${pullRequestId}/threads?api-version=7.1`,
    );

    const existingKeys = new Map<string, boolean>();
    const activeContextRows: Array<{
      filePath: string;
      lineNumber: number;
      status: string;
      summary: string;
    }> = [];
    const resolvedContextRows: Array<{
      filePath: string;
      lineNumber: number;
      status: string;
      summary: string;
    }> = [];
    const activeThreads: ActiveThreadInfo[] = [];
    const pendingThreads = extractPendingThreads(existingThreads, botTag);

    for (const thread of existingThreads.value) {
      if (thread.isDeleted || !thread.threadContext?.filePath) {
        continue;
      }

      const threadStatus = thread.status;
      if (!['active', 'pending', 'fixed', 'wontFix', 'closed', 'byDesign'].includes(threadStatus)) {
        continue;
      }

      const botComment = thread.comments.find(
        (comment) => !comment.isDeleted && commentHasBotTag(comment.content, botTag),
      );
      if (!botComment) {
        continue;
      }

      const normalizedPath = normalizeFilePath(thread.threadContext.filePath);
      const lineNumber = thread.threadContext.rightFileStart?.line ?? 0;
      const isActiveBotThread = threadStatus === 'active' || threadStatus === 'pending';

      if (isActiveBotThread) {
        existingKeys.set(`${normalizedPath}|line:${lineNumber}`, true);
      }

      if (isActiveBotThread) {
        activeContextRows.push({
          filePath: normalizedPath,
          lineNumber,
          status: threadStatus,
          summary: getReviewSummaryFromComment(botComment.content, botTag),
        });

        activeThreads.push({
          threadId: String(thread.id),
          filePath: normalizedPath,
          lineNumber,
          status: threadStatus,
          summary: getReviewSummaryFromComment(botComment.content, botTag),
          botCommentId: botComment.id,
          hasResolutionReply: threadHasResolutionReply(thread, botTag),
        });
      } else {
        // Threads do bot já resolvidas (fixed/wontFix/closed/byDesign): NÃO entram no
        // dedup determinístico (existingKeys), mas viram memória para o LLM não
        // re-levantar problemas já tratados sem nova evidência (evita loop de re-litígio).
        resolvedContextRows.push({
          filePath: normalizedPath,
          lineNumber,
          status: threadStatus,
          summary: getReviewSummaryFromComment(botComment.content, botTag),
        });
      }
    }

    log(`Found ${pendingThreads.length} pending thread(s) on PR (all authors).`);
    log(`Found ${activeThreads.length} active bot thread(s) eligible for resolution.`);

    if (activeContextRows.length === 0 && resolvedContextRows.length === 0) {
      return {
        existingKeys,
        contextForLlm: '',
        activeThreads,
        allThreads: existingThreads,
        pendingThreads,
      };
    }

    let contextForLlm = `## Existing Pull Request Reviews (DO NOT duplicate)

- Do NOT repeat reviews for the same file+line or semantically identical feedback.
- You MAY return new reviews for lines that changed materially or were not reviewed before.
- If the current diff already addresses an **active** issue, add that thread to \`resolvedThreads\` with \`threadId\` or \`fileName\`+\`lineNumber\` and a note explaining what was fixed.
- Do NOT auto-resolve a thread just because the line disappeared from the diff — only resolve when you verified the underlying issue no longer exists.
`;

    if (activeContextRows.length > 0 || resolvedContextRows.length > 0) {
      contextForLlm += `
### Padrões de Risco Detectados Nesta PR (Memória Intra-PR)

Nas rodadas anteriores, foram identificados os seguintes problemas na base de código:
`;
      const allSummaries = new Set<string>();
      for (const row of [...activeContextRows, ...resolvedContextRows]) {
        const shortSummary = row.summary.trim();
        if (shortSummary) {
          allSummaries.add(`- ${shortSummary}`);
        }
      }
      for (const summary of allSummaries) {
        contextForLlm += `${summary}\n`;
      }
      contextForLlm += `
**Ação Obrigatória (Fase 1 e 2):** Ao analisar o diff atual, priorize a busca por variações destes mesmos erros. O desenvolvedor pode ter corrigido a linha exata apontada anteriormente, mas cometido o mesmo erro nos novos arquivos/linhas deste commit. Use tools para caçar ativamente as mesmas vulnerabilidades e agrupe-as via \`relatedOccurrences\`.
`;
    }

    contextForLlm += `
### Active threads (open)

`;

    if (activeContextRows.length > 0) {
      contextForLlm += '| File | Line | Status | Summary |\n|------|------|--------|----------|\n';
      for (const row of activeContextRows) {
        const escapedSummary = row.summary.replace(/\|/g, '/');
        contextForLlm += `| ${row.filePath} | ${row.lineNumber} | ${row.status} | ${escapedSummary} |\n`;
      }
    } else {
      contextForLlm += '_No active bot review threads at the moment._\n';
    }

    if (resolvedContextRows.length > 0) {
      contextForLlm += `
### Already resolved threads (memory — do NOT re-raise without new evidence)

These issues were reported in a previous round and already resolved/closed. Do **not** create new reviews for them unless tools prove the problem was **reintroduced** by the current diff. This prevents an endless fix→review loop.

| File | Line | Status | Summary |
|------|------|--------|----------|
`;
      for (const row of resolvedContextRows) {
        const escapedSummary = row.summary.replace(/\|/g, '/');
        contextForLlm += `| ${row.filePath} | ${row.lineNumber} | ${row.status} | ${escapedSummary} |\n`;
      }
    }

    return {
      existingKeys,
      contextForLlm,
      activeThreads,
      allThreads: existingThreads,
      pendingThreads,
    };
  } catch (error) {
    log(`Error: failed to retrieve existing threads: ${String(error)}`);
    throw new Error(`Failed to retrieve PR threads: ${String(error)}`);
  }
}

export function testReviewSummaryAlreadyPosted(
  threads: AdoThreadsResponse | null,
  botTag: string,
  summaryText: string,
): boolean {
  if (!threads) return false;

  const normalizedSummary = summaryText.replace(/\s+/g, ' ').trim();

  for (const thread of threads.value) {
    if (thread.threadContext?.filePath) {
      continue;
    }

    for (const comment of thread.comments) {
      if (comment.isDeleted || !commentHasBotTag(comment.content, botTag)) {
        continue;
      }
      if (!comment.content.includes(REVIEW_SUMMARY_MARKER)) {
        continue;
      }

      let existing = comment.content.replaceAll(botTag, '');
      existing = existing.replace(REVIEW_SUMMARY_MARKER, '');
      existing = existing.replace(/\s+/g, ' ').trim();

      if (existing === normalizedSummary) {
        return true;
      }
    }
  }

  return false;
}
