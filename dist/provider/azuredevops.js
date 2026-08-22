import { AdoClient } from '../ado/client.js';
import { getPullRequestContext } from '../ado/pull-request.js';
import { getPullRequestReviewContext } from '../ado/review-context.js';
import { getPullRequestWorkItemContext } from '../ado/work-items.js';
import { resolvePullRequestReviewThreads, setPullRequestComments, setPullRequestReviewSummary, } from '../ado/post-comments.js';
import { parseRoundStateFromThreads, persistRoundState } from '../ado/round-state.js';
import { emitPipelineReviewOutput } from '../ado/pipeline-logging.js';
export class AdoProvider {
    name = 'azuredevops';
    config;
    ado;
    async initialize(config, _logger) {
        this.config = config;
        this.ado = new AdoClient(config.organization, config.project, config.repositoryName, config.adoAccessToken);
    }
    async getPullRequestContext(log) {
        return getPullRequestContext(this.ado, this.config.pullRequestId, log);
    }
    async getPullRequestReviewContext(botTag, log) {
        return getPullRequestReviewContext(this.ado, this.config.pullRequestId, botTag, log);
    }
    async getPullRequestWorkItemContext(maxWorkItems, log) {
        return getPullRequestWorkItemContext(this.ado, this.config.pullRequestId, maxWorkItems, log);
    }
    async resolvePullRequestReviewThreads(botTag, activeThreads, resolvedItems, log) {
        return resolvePullRequestReviewThreads(this.ado, this.config.pullRequestId, botTag, activeThreads, resolvedItems, log);
    }
    async setPullRequestComments(botTag, reviewsJson, existingKeys, log) {
        return setPullRequestComments(this.ado, this.config.pullRequestId, botTag, reviewsJson, existingKeys, log, this.config.scoreMin);
    }
    async postPrComment(botTag, commentBody, log) {
        const commentContent = [botTag, '', commentBody].join('\n');
        try {
            await this.ado.post(`/pullRequests/${this.config.pullRequestId}/threads?api-version=7.1`, {
                comments: [{ parentCommentId: 0, content: commentContent, commentType: 1 }],
                status: 'closed',
            });
            log('Comment posted to PR.');
            return true;
        }
        catch (error) {
            log(`Error: failed to post PR comment: ${String(error)}`);
            return false;
        }
    }
    async setPullRequestReviewSummary(botTag, summaryText, allThreads, log) {
        return setPullRequestReviewSummary(this.ado, this.config.pullRequestId, botTag, summaryText, allThreads, log);
    }
    parseRoundStateFromThreads(allThreads, botTag) {
        return parseRoundStateFromThreads(allThreads, botTag);
    }
    async persistRoundState(botTag, input, existing, log) {
        return persistRoundState(this.ado, this.config.pullRequestId, botTag, input, existing, log);
    }
    emitPipelineReviewOutput(gate, reviews, dryRun, metrics, log) {
        emitPipelineReviewOutput(gate, reviews, dryRun, metrics, log);
    }
}
//# sourceMappingURL=azuredevops.js.map