import { AdoClient } from './client.js';
import { stripHtml } from './utils.js';

interface PullRequestApiResponse {
  pullRequestId?: number;
  title?: string;
  description?: string;
}

export interface PullRequestContextResult {
  pullRequestId: number;
  title: string;
  contextForLlm: string;
}

export function formatReviewStartLogMessage(pullRequestId: number, title?: string): string {
  const trimmedTitle = title?.trim();
  return trimmedTitle
    ? `Iniciando revisão somente leitura da PR #${pullRequestId} sobre ${trimmedTitle}.`
    : `Iniciando revisão somente leitura da PR #${pullRequestId}.`;
}

export function buildPullRequestContextForLlm(
  pullRequestId: number,
  title: string,
  description: string,
): string {
  const lines = [
    '## Pull Request (Azure DevOps)',
    '',
    `> **Pull Request ID:** #${pullRequestId} — use **somente este número** ao referenciar a PR. IDs numéricos de Work Items (User Story, Task, Bug) na seção "Linked Work Items" são **diferentes** do ID da PR.`,
    '',
  ];

  if (title) {
    lines.push(`**Título:** ${title}`);
  }
  if (description) {
    lines.push('', '**Descrição:**', description);
  }

  return lines.join('\n');
}

export async function getPullRequestContext(
  client: AdoClient,
  pullRequestId: number,
  log?: (msg: string) => void,
): Promise<PullRequestContextResult> {
  const empty: PullRequestContextResult = {
    pullRequestId,
    title: '',
    contextForLlm: '',
  };

  if (pullRequestId <= 0) {
    return empty;
  }

  try {
    const pr = await client.get<PullRequestApiResponse>(
      `/pullRequests/${pullRequestId}?api-version=7.1`,
    );

    const resolvedId =
      typeof pr.pullRequestId === 'number' && pr.pullRequestId > 0 ? pr.pullRequestId : pullRequestId;
    if (resolvedId !== pullRequestId) {
      log?.(
        `Warning: Pull Request ID da API (#${resolvedId}) difere do configurado (#${pullRequestId}); usando o da API.`,
      );
    }

    const title = pr.title?.trim() ?? '';
    const description = pr.description ? stripHtml(pr.description).trim() : '';

    if (!title && !description) {
      log?.(formatReviewStartLogMessage(resolvedId));
      return {
        pullRequestId: resolvedId,
        title: '',
        contextForLlm: buildPullRequestContextForLlm(resolvedId, '', ''),
      };
    }

    log?.(formatReviewStartLogMessage(resolvedId, title));

    return {
      pullRequestId: resolvedId,
      title,
      contextForLlm: buildPullRequestContextForLlm(resolvedId, title, description),
    };
  } catch (error) {
    log?.(`Warning: failed to load PR details: ${String(error)}`);
    log?.(formatReviewStartLogMessage(pullRequestId));
    return {
      pullRequestId,
      title: '',
      contextForLlm: buildPullRequestContextForLlm(pullRequestId, '', ''),
    };
  }
}

/** @deprecated Use getPullRequestContext — mantido para compatibilidade interna. */
export async function getPullRequestDescriptionContext(
  client: AdoClient,
  pullRequestId: number,
  log?: (msg: string) => void,
): Promise<string> {
  const result = await getPullRequestContext(client, pullRequestId, log);
  return result.contextForLlm;
}
