import { canonicalFilePath, normalizeFilePath, stripHtml } from './utils.js';
import { commentBodyHasResolutionReply, RESOLUTION_MARKER, REVIEW_SUMMARY_MARKER, } from '../git/markers.js';
import { extractAgenticBotTagLine, isAgenticReviewerComment, stripAgenticBotTags, } from '../bot-tag.js';
export function getReviewSummaryFromComment(content, botTag) {
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
/** Texto integral do comentário da thread (sem truncar) para análise do auto-fix. */
export function getThreadDescription(content, botTag) {
    let description = content.replace(/<details>[\s\S]*?<\/details>/gi, '');
    description = stripAgenticBotTags(description);
    return description;
}
function getFirstVisibleComment(thread) {
    return thread.comments.find((comment) => !comment.isDeleted && comment.commentType === 1);
}
function extractPendingThreads(threads, botTag) {
    const pending = [];
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
        const isBot = isAgenticReviewerComment(rawContent);
        const detectedBotTag = isBot ? extractAgenticBotTagLine(rawContent) : null;
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
/** Threads pendentes do runner para gate e resumo final (exclui revisores humanos). */
export function filterGatePendingThreads(threads) {
    return threads.filter((t) => t.isBot && t.botTag != null);
}
export async function getPullRequestReviewContext(client, pullRequestId, botTag, log) {
    try {
        const existingThreads = await client.get(`/pullRequests/${pullRequestId}/threads?api-version=7.1`);
        const existingKeys = new Map();
        const activeContextRows = [];
        const resolvedContextRows = [];
        const fileReviewThreads = [];
        const pendingThreads = extractPendingThreads(existingThreads, botTag);
        for (const thread of existingThreads.value) {
            if (thread.isDeleted || !thread.threadContext?.filePath) {
                continue;
            }
            const threadStatus = thread.status;
            if (!['active', 'pending', 'fixed', 'wontFix', 'closed', 'byDesign'].includes(threadStatus)) {
                continue;
            }
            const rootComment = getFirstVisibleComment(thread);
            if (!rootComment) {
                continue;
            }
            const canonicalPath = canonicalFilePath(thread.threadContext.filePath);
            const normalizedPath = normalizeFilePath(canonicalPath);
            const lineNumber = thread.threadContext.rightFileStart?.line ?? 0;
            if (lineNumber <= 0) {
                continue;
            }
            const isOpen = threadStatus === 'active' || threadStatus === 'pending';
            const summary = getReviewSummaryFromComment(rootComment.content, botTag);
            const hasResolutionReply = thread.comments.some((comment) => !comment.isDeleted &&
                comment.id !== rootComment.id &&
                (commentBodyHasResolutionReply(comment.content, botTag) ||
                    comment.content.includes(RESOLUTION_MARKER)));
            if (isOpen) {
                existingKeys.set(`${normalizedPath}|line:${lineNumber}`, true);
                activeContextRows.push({
                    filePath: canonicalPath,
                    lineNumber,
                    status: threadStatus,
                    summary,
                });
                fileReviewThreads.push({
                    threadId: String(thread.id),
                    filePath: canonicalPath,
                    lineNumber,
                    status: threadStatus,
                    summary,
                    description: getThreadDescription(rootComment.content, botTag),
                    botCommentId: rootComment.id,
                    hasResolutionReply,
                });
            }
            else {
                resolvedContextRows.push({
                    filePath: canonicalPath,
                    lineNumber,
                    status: threadStatus,
                    summary,
                });
            }
        }
        log(`Found ${pendingThreads.length} pending thread(s) on PR (all authors).`);
        log(`Found ${fileReviewThreads.length} open file review thread(s).`);
        if (activeContextRows.length === 0 && resolvedContextRows.length === 0) {
            return {
                existingKeys,
                contextForLlm: '',
                fileReviewThreads,
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
### Risk Patterns Detected in This PR (Intra-PR Memory)

In previous rounds, the following issues were identified in the codebase:
`;
            const allSummaries = new Set();
            for (const row of [...activeContextRows, ...resolvedContextRows]) {
                const shortSummary = row.summary.trim();
                if (shortSummary) {
                    allSummaries.add(`- ${shortSummary}`);
                }
            }
            for (const summary of allSummaries) {
                contextForLlm += `${summary}\n`;
            }
            contextForLlm += `\n**Mandatory Action (Phases 1 and 2):** When analyzing the current diff, prioritize searching for variations of these same errors. The developer may have fixed the exact line pointed out previously but made the same mistake in new files/lines of this commit. Use tools to actively hunt for the same vulnerabilities and group them via \`relatedOccurrences\`.
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
        }
        else {
            contextForLlm += '_No active file review threads at the moment._\n';
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
            fileReviewThreads,
            allThreads: existingThreads,
            pendingThreads,
        };
    }
    catch (error) {
        log(`Error: failed to retrieve existing threads: ${String(error)}`);
        throw new Error(`Failed to retrieve PR threads: ${String(error)}`);
    }
}
export function testReviewSummaryAlreadyPosted(threads, botTag, summaryText) {
    if (!threads)
        return false;
    const normalizedSummary = summaryText.replace(/\s+/g, ' ').trim();
    for (const thread of threads.value) {
        if (thread.threadContext?.filePath) {
            continue;
        }
        for (const comment of thread.comments) {
            if (comment.isDeleted || !isAgenticReviewerComment(comment.content)) {
                continue;
            }
            if (!comment.content.includes(REVIEW_SUMMARY_MARKER)) {
                continue;
            }
            let existing = stripAgenticBotTags(comment.content);
            existing = existing.replace(REVIEW_SUMMARY_MARKER, '');
            existing = existing.replace(/\s+/g, ' ').trim();
            if (existing === normalizedSummary) {
                return true;
            }
        }
    }
    return false;
}
//# sourceMappingURL=review-context.js.map