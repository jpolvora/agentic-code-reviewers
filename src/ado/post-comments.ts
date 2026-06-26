import { AdoClient } from './client.js';
import { formatCommentForPosting } from './format-thread.js';
import {
  DEFAULT_SCORE_MIN,
  filterPublishableReviews,
  isPublishableReview,
} from './review-validation.js';
import { normalizeFilePath, reviewDedupKey as pathLineDedupKey } from './utils.js';
import { RESOLUTION_MARKER, REVIEW_SUMMARY_MARKER } from '../git/markers.js';
import { testReviewSummaryAlreadyPosted } from './review-context.js';
import type {
  ActiveThreadInfo,
  AdoThreadsResponse,
  CodeReviewItem,
  CodeReviewResponse,
  ParsedCodeReviewResponse,
  PendingPrThread,
  PostedReviewThread,
  PostingPlan,
  ResolvedThreadItem,
} from './types.js';

function reviewDedupKey(review: Pick<CodeReviewItem, 'fileName' | 'lineNumber'>): string {
  return pathLineDedupKey(review.fileName, review.lineNumber);
}

export function parseCodeReviewResponse(
  raw: CodeReviewResponse,
  scoreMin: number = DEFAULT_SCORE_MIN,
): ParsedCodeReviewResponse {
  const incoming = raw.reviews ?? [];
  
  const flattenedIncoming: CodeReviewItem[] = [];
  const seenKeys = new Set<string>();

  for (const review of incoming) {
    const parentKey = reviewDedupKey(review);
    if (!seenKeys.has(parentKey)) {
      seenKeys.add(parentKey);
      flattenedIncoming.push(review);
    } else if (isPublishableReview(review, scoreMin)) {
      const idx = flattenedIncoming.findIndex((r) => reviewDedupKey(r) === parentKey);
      if (idx >= 0 && !isPublishableReview(flattenedIncoming[idx]!, scoreMin)) {
        flattenedIncoming[idx] = review;
      }
    }

    if (review.relatedOccurrences && review.relatedOccurrences.length > 0) {
      for (const occ of review.relatedOccurrences) {
        const occKey = reviewDedupKey(occ);
        const flattenedOcc: CodeReviewItem = {
          ...review,
          fileName: occ.fileName,
          lineNumber: occ.lineNumber,
          relatedOccurrences: undefined,
          comment: `*(Ocorrência similar identificada)*\n\n${review.comment}`,
        };
        if (seenKeys.has(occKey)) {
          if (isPublishableReview(flattenedOcc, scoreMin)) {
            const idx = flattenedIncoming.findIndex((r) => reviewDedupKey(r) === occKey);
            if (idx >= 0 && !isPublishableReview(flattenedIncoming[idx]!, scoreMin)) {
              flattenedIncoming[idx] = flattenedOcc;
            }
          }
          continue;
        }
        seenKeys.add(occKey);
        flattenedIncoming.push(flattenedOcc);
      }
    }
  }

  const reviews = filterPublishableReviews(flattenedIncoming, scoreMin);
  if (reviews.length < flattenedIncoming.length) {
    const belowMinLabel = scoreMin > 0 ? `score < ${scoreMin}` : 'score inválido';
    console.warn(
      `Policy: ${flattenedIncoming.length - reviews.length} review(s) descartado(s) — ${belowMinLabel}, campos obrigatórios ausentes ou contrato inválido.`,
    );
  }
  const resolvedThreads = raw.resolvedThreads ?? [];
  const reviewSummary = raw.reviewSummary ?? '';
  const hasCriticalReviews = reviews.some((review) => review.severity === 'critical');

  return {
    reviews,
    resolvedThreads,
    reviewSummary,
    hasCriticalReviews,
    reviewsJson: JSON.stringify({ reviews }),
  };
}

export { isPublishableReview };

export function getCodeReviewPostingPlan(
  parsed: ParsedCodeReviewResponse,
  hasExternalPendingThreads: boolean,
): PostingPlan {
  // `parsed.reviews` já passou pelo gate autoritativo em parseCodeReviewResponse
  // (filterPublishableReviews). O filtro defensivo final fica em setPullRequestComments,
  // no boundary de POST do ADO.
  const reviews = parsed.reviews;
  let summary = parsed.reviewSummary;

  if (reviews.length > 0 && summary.trim()) {
    if (parsed.hasCriticalReviews) {
      console.warn('Policy: reviewSummary ignored because critical reviews are present.');
      summary = '';
    } else {
      console.warn(
        `Policy: agent returned reviews and reviewSummary together; keeping ${reviews.length} review(s), clearing reviewSummary.`,
      );
      summary = '';
    }
  }

  const canPostSummary =
    summary.trim().length > 0 && !parsed.hasCriticalReviews && reviews.length === 0 && !hasExternalPendingThreads;

  return {
    reviewsJson: JSON.stringify({ reviews }),
    reviewSummary: summary,
    postSummary: canPostSummary,
  };
}

export function isDuplicateReview(review: CodeReviewItem, existingKeys: Map<string, boolean>): boolean {
  return existingKeys.has(reviewDedupKey(review));
}

export function matchesResolvedItem(threadInfo: ActiveThreadInfo, item: ResolvedThreadItem): boolean {
  if (item.threadId != null && String(item.threadId) === threadInfo.threadId) {
    return true;
  }
  if (item.fileName && item.lineNumber != null && item.lineNumber > 0) {
    const normalizedFile = normalizeFilePath(item.fileName);
    return normalizedFile === threadInfo.filePath && item.lineNumber === threadInfo.lineNumber;
  }
  return false;
}

export function filterValidResolvedItems(resolvedItems: ResolvedThreadItem[]): ResolvedThreadItem[] {
  return resolvedItems.filter(
    (item) =>
      item.threadId != null ||
      (Boolean(item.fileName) && item.lineNumber != null && item.lineNumber > 0),
  );
}

export function isActiveOrPendingStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === 'active' || normalized === 'pending';
}

function collectSimulatedResolvedThreadIds(
  activeThreads: ActiveThreadInfo[],
  resolvedItems: ResolvedThreadItem[],
): Set<string> {
  const llmResolved = filterValidResolvedItems(resolvedItems);
  const resolvedThreadIds = new Set<string>();

  for (const threadInfo of activeThreads) {
    if (threadInfo.hasResolutionReply && isActiveOrPendingStatus(threadInfo.status)) {
      resolvedThreadIds.add(threadInfo.threadId);
      continue;
    }

    if (threadInfo.hasResolutionReply) {
      continue;
    }

    const match = llmResolved.find((item) => matchesResolvedItem(threadInfo, item));
    if (match) {
      resolvedThreadIds.add(threadInfo.threadId);
    }
  }

  return resolvedThreadIds;
}

/** Espelha a lógica de `resolvePullRequestReviewThreads` sem chamadas ADO (dry-run). */
export function simulateThreadResolution(
  activeThreads: ActiveThreadInfo[],
  pendingThreads: PendingPrThread[],
  resolvedItems: ResolvedThreadItem[],
): { resolvedCount: number; pendingThreads: PendingPrThread[] } {
  const resolvedThreadIds = collectSimulatedResolvedThreadIds(activeThreads, resolvedItems);

  if (resolvedThreadIds.size === 0) {
    return { resolvedCount: 0, pendingThreads };
  }

  return {
    resolvedCount: resolvedThreadIds.size,
    pendingThreads: pendingThreads.filter((thread) => !resolvedThreadIds.has(thread.threadId)),
  };
}

/** Resolve apenas threads confirmadas pelo agente em `resolvedThreads`. */
export async function resolvePullRequestReviewThreads(
  client: AdoClient,
  pullRequestId: number,
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
    const patchUrl = `/pullRequests/${pullRequestId}/threads/${threadInfo.threadId}?api-version=7.1`;

    if (threadInfo.hasResolutionReply && isActiveOrPendingStatus(threadInfo.status)) {
      try {
        await client.patch(patchUrl, { status: 'fixed' });
        log(
          `Recovered stuck thread ${threadInfo.threadId} (PATCH-only after partial resolution).`,
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

    const replyUrl = `/pullRequests/${pullRequestId}/threads/${threadInfo.threadId}/comments?api-version=7.1`;

    try {
      await client.post(replyUrl, {
        content: replyContent,
        parentCommentId: threadInfo.botCommentId,
        commentType: 1,
      });
    } catch (error) {
      log(`Error: failed to post resolution reply on thread ${threadInfo.threadId}: ${String(error)}`);
      throw error;
    }

    try {
      await client.patch(patchUrl, { status: 'fixed' });
      log(`Resolved thread ${threadInfo.threadId} (${threadInfo.filePath}:${threadInfo.lineNumber}).`);
      resolvedCount++;
    } catch (error) {
      log(
        `Error: resolution reply posted but PATCH failed for thread ${threadInfo.threadId}: ${String(error)}`,
      );
      throw error;
    }
  }

  return resolvedCount;
}

export async function setPullRequestReviewSummary(
  client: AdoClient,
  pullRequestId: number,
  botTag: string,
  summaryText: string,
  allThreads: AdoThreadsResponse | null,
  log: (msg: string) => void,
): Promise<boolean> {
  if (!summaryText.trim()) {
    return false;
  }

  if (testReviewSummaryAlreadyPosted(allThreads, botTag, summaryText)) {
    log('Review summary already posted with identical content. Skipping.');
    return false;
  }

  const commentContent = [botTag, REVIEW_SUMMARY_MARKER, '', summaryText.trim()].join('\n');
  const response = await client.post<{ id: number }>(`/pullRequests/${pullRequestId}/threads?api-version=7.1`, {
    comments: [
      {
        parentCommentId: 0,
        content: commentContent,
        commentType: 1,
      },
    ],
    status: 'closed',
  });

  log(`Review summary posted (Thread ID: ${response.id}).`);
  return true;
}

export async function setPullRequestComments(
  client: AdoClient,
  pullRequestId: number,
  botTag: string,
  reviewsJson: string,
  existingKeys: Map<string, boolean>,
  log: (msg: string) => void,
  scoreMin: number = DEFAULT_SCORE_MIN,
): Promise<PostedReviewThread[]> {
  const posted: PostedReviewThread[] = [];
  const connection = await client.getConnectionData();
  log(`Authenticated as: ${connection.authenticatedUser.providerDisplayName}`);

  const reviewsObject = JSON.parse(reviewsJson) as { reviews: CodeReviewItem[] };
  const reviews = (reviewsObject.reviews ?? []).filter((review) => isPublishableReview(review, scoreMin));

  if (reviews.length === 0) {
    log('No reviews to post.');
    return posted;
  }

  const newReviews = reviews.filter((review) => !isDuplicateReview(review, existingKeys));
  if (newReviews.length === 0) {
    log('All comments already exist. No new comments to post.');
    return posted;
  }

  const skipped = reviews.length - newReviews.length;
  if (skipped > 0) {
    log(`Skipping ${skipped} duplicate comment(s).`);
  }

  const failures: string[] = [];

  for (const review of newReviews) {
    const commentBody = formatCommentForPosting(review, botTag);

    try {
      const postBody: Record<string, unknown> = {
        comments: [
          {
            parentCommentId: 0,
            content: commentBody,
            commentType: 1,
          },
        ],
        status: 1,
      };

      if (review.fileName && review.lineNumber > 0) {
        postBody.threadContext = {
          filePath: review.fileName,
          rightFileStart: { line: review.lineNumber, offset: 1 },
          rightFileEnd: { line: review.lineNumber, offset: 1000 },
        };
      }

      const response = await client.post<{ id: number; comments?: Array<{ id: number }> }>(
        `/pullRequests/${pullRequestId}/threads?api-version=7.1`,
        postBody,
      );

      const dedupInfo = `line ${review.lineNumber}`;
      log(`Comment posted on '${review.fileName}' (${dedupInfo}) (Thread ID: ${response.id}).`);

      const botCommentId = response.comments?.[0]?.id ?? 0;
      posted.push({
        threadId: String(response.id),
        botCommentId,
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

export function getNewReviewsFromPlan(
  reviewsJson: string,
  existingKeys: Map<string, boolean>,
  scoreMin: number = DEFAULT_SCORE_MIN,
): CodeReviewItem[] {
  const reviewsObject = JSON.parse(reviewsJson) as { reviews: CodeReviewItem[] };
  return (reviewsObject.reviews ?? [])
    .filter((review) => isPublishableReview(review, scoreMin))
    .filter((review) => !isDuplicateReview(review, existingKeys));
}
