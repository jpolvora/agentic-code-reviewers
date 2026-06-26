import { writeFileSync } from 'node:fs';
import type { ReviewerConfig } from '../config.js';
import type { Logger } from '../logger.js';
import { formatCommentForPosting } from '../ado/format-thread.js';
import { getReviewSummaryFromComment } from '../ado/review-context.js';
import {
  filterValidResolvedItems,
  isActiveOrPendingStatus,
  isDuplicateReview,
  isPublishableReview,
  matchesResolvedItem,
} from '../ado/post-comments.js';
import {
  buildRoundStateComment,
  ROUND_STATE_MARKER,
  type RoundStateCommentInput,
  type RoundStateLocation,
} from '../ado/round-state.js';
import { commentHasBotTag, normalizeFilePath, reviewDedupKey } from '../ado/utils.js';
import {
  commentBodyHasResolutionReply,
  RESOLUTION_MARKER,
  REVIEW_SUMMARY_MARKER,
} from '../git/markers.js';
import { GithubClient } from './github-client.js';
import type { PlatformProvider } from './types.js';
import type {
  ActiveThreadInfo,
  CodeReviewItem,
  GateEvaluation,
  PendingPrThread,
  PostedReviewThread,
  ResolvedThreadItem,
  ReviewContextResult,
} from '../ado/types.js';
import {
  formatTokenCount,
  hasEngineMetrics,
} from '../agent/metrics-display.js';
import { ENGINE_METRIC_KEYS } from '../engine/types.js';

export class GithubProvider implements PlatformProvider {
  readonly name = 'github';
  private config!: ReviewerConfig;
  private client!: GithubClient;
  private headRefOid: string = '';

  async initialize(config: ReviewerConfig, _logger: Logger): Promise<void> {
    this.config = config;
    const token = config.adoAccessToken || process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
    this.client = new GithubClient(
      config.organization, // Reuses organization as owner
      config.repositoryName,
      token,
    );
  }

  async getPullRequestContext(log?: (msg: string) => void) {
    const path = `/repos/${this.config.organization}/${this.config.repositoryName}/pulls/${this.config.pullRequestId}`;
    try {
      const pr = await this.client.restGet<{ title?: string; body?: string }>(path);
      const title = pr.title?.trim() ?? '';
      const body = pr.body?.trim() ?? '';
      const contextForLlm = [
        '## Pull Request (GitHub)',
        '',
        `> **Pull Request ID:** #${this.config.pullRequestId} — use **somente este número** ao referenciar a PR.`,
        '',
        `**Título:** ${title}`,
        body ? `\n**Descrição:**\n${body}` : '',
      ].join('\n');

      log?.(`Iniciando revisão somente leitura da PR #${this.config.pullRequestId} sobre ${title}.`);
      return {
        pullRequestId: this.config.pullRequestId,
        title,
        contextForLlm,
      };
    } catch (error) {
      log?.(`Warning: failed to load PR details: ${String(error)}`);
      return {
        pullRequestId: this.config.pullRequestId,
        title: '',
        contextForLlm: `## Pull Request (GitHub)\n\n> **Pull Request ID:** #${this.config.pullRequestId}`,
      };
    }
  }

  async getPullRequestReviewContext(botTag: string, log: (msg: string) => void): Promise<ReviewContextResult> {
    try {
      const pr = await this.client.fetchPullRequestContextData(this.config.pullRequestId, log);
      this.headRefOid = pr.headRefOid;

      const existingKeys = new Map<string, boolean>();
      const activeContextRows: Array<{ filePath: string; lineNumber: number; status: string; summary: string }> = [];
      const resolvedContextRows: Array<{ filePath: string; lineNumber: number; status: string; summary: string }> = [];
      const activeThreads: ActiveThreadInfo[] = [];
      const pendingThreads: PendingPrThread[] = [];

      for (const thread of pr.reviewThreads) {
        const comments = thread.comments.filter((c) => c && c.body);
        if (comments.length === 0) continue;

        const firstComment = comments[0];
        const rawContent = firstComment.body;
        const isBot = commentHasBotTag(rawContent, botTag, 'contains');
        const normalizedPath = normalizeFilePath(thread.path);
        const lineNumber = thread.line ?? 1;

        const isResolved = thread.isResolved;
        const status = isResolved ? 'fixed' : 'active';

        if (isBot && !isResolved) {
          existingKeys.set(reviewDedupKey(normalizedPath, lineNumber), true);
        }

        const summary = getReviewSummaryFromComment(rawContent, botTag);

        if (isBot) {
          if (!isResolved) {
            activeContextRows.push({
              filePath: normalizedPath,
              lineNumber,
              status,
              summary,
            });
            activeThreads.push({
              threadId: thread.id,
              filePath: normalizedPath,
              lineNumber,
              status,
              summary,
              botCommentId: firstComment.databaseId,
              hasResolutionReply: comments.some(
                (c) =>
                  c.databaseId !== firstComment.databaseId &&
                  commentHasBotTag(c.body, botTag, 'contains') &&
                  commentBodyHasResolutionReply(c.body, botTag),
              ),
            });
          } else {
            resolvedContextRows.push({
              filePath: normalizedPath,
              lineNumber,
              status,
              summary,
            });
          }
        }

        if (!isResolved) {
          pendingThreads.push({
            threadId: thread.id,
            status: 'active',
            filePath: normalizedPath,
            lineNumber,
            author: firstComment.author?.login ?? 'unknown',
            isBot,
            botTag: isBot ? botTag : null,
            summary: rawContent.slice(0, 160),
          });
        }
      }

      const allThreadsMock = {
        value: pr.prComments.map((c) => ({
          id: c.databaseId,
          status: 'closed',
          comments: [{
            id: c.databaseId,
            parentCommentId: 0,
            content: c.body,
            commentType: 1,
            author: { displayName: c.author?.login },
          }],
        })),
      };

      log(`Found ${pendingThreads.length} pending thread(s) on PR (all authors).`);
      log(`Found ${activeThreads.length} active bot thread(s) eligible for resolution.`);

      let contextForLlm = '';
      if (activeContextRows.length > 0 || resolvedContextRows.length > 0) {
        contextForLlm = `## Existing Pull Request Reviews (DO NOT duplicate)

- Do NOT repeat reviews for the same file+line or semantically identical feedback.
- You MAY return new reviews for lines that changed materially or were not reviewed before.
- If the current diff already addresses an **active** issue, add that thread to \`resolvedThreads\` with \`threadId\` or \`fileName\`+\`lineNumber\` and a note explaining what was fixed.
- Do NOT auto-resolve a thread just because the line disappeared from the diff — only resolve when you verified the underlying issue no longer exists.
`;

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
      }

      return {
        existingKeys,
        contextForLlm,
        activeThreads,
        allThreads: allThreadsMock as any,
        pendingThreads,
      };
    } catch (error) {
      log(`Error: failed to retrieve existing threads: ${String(error)}`);
      throw new Error(`Failed to retrieve PR threads: ${String(error)}`);
    }
  }

  async getPullRequestWorkItemContext(_maxWorkItems?: number, _log?: (msg: string) => void) {
    return {
      workItemIds: [],
      contextForLlm: '',
      summaries: [],
    };
  }

  async resolvePullRequestReviewThreads(
    botTag: string,
    activeThreads: ActiveThreadInfo[],
    resolvedItems: ResolvedThreadItem[],
    log: (msg: string) => void,
  ): Promise<number> {
    if (activeThreads.length === 0) {
      log('No active review threads to evaluate for resolution.');
      return 0;
    }

    const llmResolved = filterValidResolvedItems(resolvedItems);
    let resolvedCount = 0;

    for (const threadInfo of activeThreads) {
      if (threadInfo.hasResolutionReply && isActiveOrPendingStatus(threadInfo.status)) {
        try {
          await this.resolveGithubThread(threadInfo.threadId);
          log(
            `Recovered stuck thread ${threadInfo.threadId} (resolve-only after partial resolution).`,
          );
          resolvedCount++;
        } catch (error) {
          log(`Error: failed to recover stuck thread ${threadInfo.threadId}: ${String(error)}`);
          throw error;
        }
        continue;
      }

      if (threadInfo.hasResolutionReply) {
        log(`Thread ${threadInfo.threadId} already has a resolution reply. Skipping.`);
        continue;
      }

      const match = llmResolved.find((item) => matchesResolvedItem(threadInfo, item));
      if (!match) {
        continue;
      }

      const reason = match.note?.trim() || 'Issue verificado como corrigido na iteração atual.';
      const replyContent = [
        botTag,
        RESOLUTION_MARKER,
        '',
        'Issue addressed in the current iteration. Marking as resolved.',
        '',
        reason.trim(),
      ].join('\n');

      try {
        const replyPath = `/repos/${this.config.organization}/${this.config.repositoryName}/pulls/${this.config.pullRequestId}/comments`;
        await this.client.restPost(replyPath, {
          body: replyContent,
          in_reply_to: Number(threadInfo.botCommentId),
        });

        await this.resolveGithubThread(threadInfo.threadId);
        log(`Resolved thread ${threadInfo.threadId} (${threadInfo.filePath}:${threadInfo.lineNumber}).`);
        resolvedCount++;
      } catch (error) {
        log(`Error: failed to resolve thread ${threadInfo.threadId}: ${String(error)}`);
        throw error;
      }
    }

    return resolvedCount;
  }

  private async resolveGithubThread(threadId: string): Promise<void> {
    const mutation = `
      mutation ResolveThread($threadId: ID!) {
        resolveReviewThread(input: { threadId: $threadId }) {
          thread {
            id
            isResolved
          }
        }
      }
    `;
    await this.client.graphql(mutation, { threadId });
  }

  async setPullRequestComments(
    botTag: string,
    reviewsJson: string,
    existingKeys: Map<string, boolean>,
    log: (msg: string) => void,
  ): Promise<PostedReviewThread[]> {
    const posted: PostedReviewThread[] = [];
    const reviewsObject = JSON.parse(reviewsJson) as { reviews: CodeReviewItem[] };
    const reviews = (reviewsObject.reviews ?? []).filter((review) =>
      isPublishableReview(review, this.config.scoreMin),
    );
    const newReviews = reviews.filter((review) => !isDuplicateReview(review, existingKeys));

    if (newReviews.length === 0) {
      log('All comments already exist. No new comments to post.');
      return posted;
    }

    const skipped = reviews.length - newReviews.length;
    if (skipped > 0) {
      log(`Skipping ${skipped} duplicate comment(s).`);
    }

    const sha = this.headRefOid;
    if (!sha) {
      throw new Error('Cannot post comments: head commit SHA (headRefOid) was not loaded.');
    }

    const failures: string[] = [];
    for (const review of newReviews) {
      // Use true for isGithub to keep ```suggestion fences intact
      const body = formatCommentForPosting(review, botTag, true);
      const filePath = review.fileName.replace(/^\/+/, '');

      try {
        const path = `/repos/${this.config.organization}/${this.config.repositoryName}/pulls/${this.config.pullRequestId}/comments`;
        const response = await this.client.restPost<{ id: number }>(path, {
          body,
          commit_id: sha,
          path: filePath,
          line: review.lineNumber,
          side: 'RIGHT',
        });

        log(`Comment posted on '${review.fileName}' line ${review.lineNumber} (Comment ID: ${response.id}).`);
        posted.push({
          threadId: String(response.id),
          botCommentId: response.id,
          review,
        });
      } catch (error) {
        const failure = `${review.fileName}:${review.lineNumber} — ${String(error)}`;
        log(`Error: failed to post comment on '${review.fileName}' line ${review.lineNumber}: ${String(error)}`);
        failures.push(failure);
      }
    }

    if (failures.length > 0) {
      throw new Error(`Falha ao publicar ${failures.length} review(s):\n${failures.join('\n')}`);
    }

    return posted;
  }

  async setPullRequestReviewSummary(
    botTag: string,
    summaryText: string,
    allThreads: any,
    log: (msg: string) => void,
  ): Promise<boolean> {
    if (!summaryText.trim()) return false;

    const existingComments = allThreads?.value ?? [];
    const normalizedSummary = summaryText.replace(/\s+/g, ' ').trim();
    for (const c of existingComments) {
      const commentContent = c.comments?.[0]?.content ?? '';
      if (commentContent.includes(botTag) && commentContent.includes(REVIEW_SUMMARY_MARKER)) {
        let existing = commentContent.replaceAll(botTag, '');
        existing = existing.replace(REVIEW_SUMMARY_MARKER, '');
        existing = existing.replace(/\s+/g, ' ').trim();
        if (existing === normalizedSummary) {
          log('Review summary already posted with identical content. Skipping.');
          return false;
        }
      }
    }

    const commentBody = [botTag, REVIEW_SUMMARY_MARKER, '', summaryText.trim()].join('\n');
    try {
      const path = `/repos/${this.config.organization}/${this.config.repositoryName}/issues/${this.config.pullRequestId}/comments`;
      await this.client.restPost(path, { body: commentBody });
      log('Review summary posted to PR conversation.');
      return true;
    } catch (error) {
      log(`Error: failed to post review summary: ${String(error)}`);
      return false;
    }
  }

  parseRoundStateFromThreads(allThreads: any, botTag: string): RoundStateLocation {
    const empty: RoundStateLocation = { round: 0, threadId: null, commentId: null };
    if (!allThreads || !allThreads.value) {
      return empty;
    }

    for (const t of allThreads.value) {
      const comment = t.comments?.[0];
      if (!comment || comment.isDeleted) continue;

      if (comment.content.includes(botTag) && comment.content.includes(ROUND_STATE_MARKER)) {
        const match = comment.content.match(/Rodada:\s*(\d+)/i);
        const round = match ? Number.parseInt(match[1], 10) : 0;
        return {
          round: Number.isFinite(round) && round > 0 ? round : 0,
          threadId: String(t.id),
          commentId: comment.id,
        };
      }
    }

    return empty;
  }

  async persistRoundState(
    botTag: string,
    input: RoundStateCommentInput,
    existing: RoundStateLocation,
    log: (msg: string) => void,
  ): Promise<void> {
    const bodyContent = buildRoundStateComment(botTag, input);

    if (existing.commentId != null) {
      const path = `/repos/${this.config.organization}/${this.config.repositoryName}/issues/comments/${existing.commentId}`;
      await this.client.restPatch(path, { body: bodyContent });
      log(`Round-state atualizado (comment ${existing.commentId}, rodada ${input.currentRound}).`);
      return;
    }

    const path = `/repos/${this.config.organization}/${this.config.repositoryName}/issues/${this.config.pullRequestId}/comments`;
    const response = await this.client.restPost<{ id: number }>(path, { body: bodyContent });
    log(`Round-state criado (comment ${response.id}, rodada ${input.currentRound}).`);
  }

  emitPipelineReviewOutput(
    gate: GateEvaluation,
    reviews: CodeReviewItem[],
    dryRun: boolean,
    metrics?: Record<string, number>,
    log: (msg: string) => void = console.log,
  ): void {
    for (const r of reviews) {
      const severity = r.severity === 'critical' ? 'error' : 'warning';
      const file = r.fileName.replace(/^\/+/, '');
      const firstLine = r.comment.split('\n').find((l) => l.trim().length > 0) ?? '';
      const cleanMessage = firstLine.replace(/\s+/g, ' ').trim();
      log(`::${severity} file=${file},line=${r.lineNumber},col=1::[Cursor Reviewer] ${cleanMessage}`);
    }

    const summaryFile = process.env.GITHUB_STEP_SUMMARY;
    if (summaryFile) {
      try {
        const markdown = this.buildGHSummaryMarkdown(gate, reviews, dryRun, metrics);
        writeFileSync(summaryFile, markdown, { encoding: 'utf8', flag: 'a' });
      } catch (err) {
        log(`Warning: failed to write GITHUB_STEP_SUMMARY: ${String(err)}`);
      }
    }
  }

  private buildGHSummaryMarkdown(
    gate: GateEvaluation,
    reviews: CodeReviewItem[],
    dryRun: boolean,
    metrics?: Record<string, number>,
  ): string {
    const lines: string[] = [];
    lines.push('### Cursor Reviewer Summary');
    lines.push('');
    lines.push(`- **Mode:** ${dryRun ? 'DRY-RUN' : 'PIPELINE'}`);
    lines.push(`- **Status:** ${gate.shouldFail ? '⚠️ Issues found' : '✅ No issues'}`);
    lines.push(`- **New reviews:** ${gate.newReviewsCount}`);
    lines.push(`- **Pending threads:** ${gate.pendingThreadCount}`);
    lines.push(`- **Resolved threads:** ${gate.resolvedCount}`);
    lines.push(
      `- **Severities:** 🛑 ${gate.severities.critical} · ⚠️ ${gate.severities.warning} · 💡 ${gate.severities.suggestion}`,
    );

    if (hasEngineMetrics(metrics)) {
      const input = metrics![ENGINE_METRIC_KEYS.inputTokens] ?? 0;
      const output = metrics![ENGINE_METRIC_KEYS.outputTokens] ?? 0;
      const total = metrics![ENGINE_METRIC_KEYS.totalTokens] ?? input + output;
      lines.push(
        `- **Tokens total:** ${formatTokenCount(total)} (Input: ${formatTokenCount(input)}, Output: ${formatTokenCount(output)})`,
      );
    }
    lines.push('');

    if (reviews.length > 0) {
      lines.push('#### Posted Reviews');
      lines.push('');
      lines.push('| Severity | File & Line | Comment |');
      lines.push('|---|---|---|');
      for (const r of reviews) {
        const file = r.fileName.replace(/^\/+/, '');
        const summary = r.comment.split('\n').find((l) => l.trim().length > 0) ?? '';
        lines.push(`| ${r.severity} | \`${file}:${r.lineNumber}\` | ${summary} |`);
      }
    }
    return lines.join('\n');
  }
}
