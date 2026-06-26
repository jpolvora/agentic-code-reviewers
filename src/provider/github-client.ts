import {
  DEFAULT_HTTP_MAX_RETRIES,
  isRetryableHttpStatus,
  paginateGraphqlConnection,
  parseRetryAfterSeconds,
  sleepBackoff,
  truncateResponseText,
  type GraphqlPageInfo,
} from '../http-retry.js';
import {
  GITHUB_PR_COMMENTS_PAGE_SIZE,
  GITHUB_REVIEW_THREADS_PAGE_SIZE,
  GITHUB_THREAD_COMMENTS_PAGE_SIZE,
  type GithubPrCommentNode,
  type GithubPullRequestContextData,
  type GithubReviewCommentNode,
  type GithubReviewThreadNode,
} from './github-queries.js';

interface ReviewThreadsPageResponse {
  repository: {
    pullRequest: {
      headRefOid: string;
      reviewThreads: {
        pageInfo: GraphqlPageInfo;
        nodes: Array<{
          id: string;
          isResolved: boolean;
          path: string;
          line: number | null;
          comments: {
            pageInfo: GraphqlPageInfo;
            nodes: GithubReviewCommentNode[];
          };
        }>;
      };
    };
  };
}

interface ThreadCommentsPageResponse {
  node: {
    comments: {
      pageInfo: GraphqlPageInfo;
      nodes: GithubReviewCommentNode[];
    };
  } | null;
}

interface PrCommentsPageResponse {
  repository: {
    pullRequest: {
      comments: {
        pageInfo: GraphqlPageInfo;
        nodes: GithubPrCommentNode[];
      };
    };
  };
}

export class GithubClient {
  constructor(
    readonly owner: string,
    readonly repository: string,
    readonly token: string,
  ) {}

  get baseUrl(): string {
    return 'https://api.github.com';
  }

  private headers(apiType: 'rest' | 'graphql'): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': 'cursor-reviewer-bot',
    };
    if (apiType === 'rest') {
      headers['Accept'] = 'application/vnd.github.v3+json';
      headers['Content-Type'] = 'application/json';
    } else {
      headers['Content-Type'] = 'application/json';
    }
    return headers;
  }

  async restGet<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async restPost<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async restPatch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const url = `${this.baseUrl}/graphql`;
    const maxRetries = DEFAULT_HTTP_MAX_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: this.headers('graphql'),
          body: JSON.stringify({ query, variables }),
        });
      } catch (networkError) {
        lastError = new Error(`GitHub GraphQL network error: ${String(networkError)}`);
        if (attempt === maxRetries) {
          throw lastError;
        }
        await sleepBackoff(attempt);
        continue;
      }

      const rawText = await response.text();

      if (!response.ok) {
        lastError = new Error(
          `GitHub GraphQL failed: ${response.status} ${truncateResponseText(rawText)}`,
        );
        if (!isRetryableHttpStatus(response.status) || attempt === maxRetries) {
          throw lastError;
        }
        const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('Retry-After'));
        await sleepBackoff(attempt, retryAfterSeconds);
        continue;
      }

      const json = JSON.parse(rawText) as { data?: T; errors?: Array<{ message: string }> };
      if (json.errors && json.errors.length > 0) {
        throw new Error(`GitHub GraphQL errors:\n${json.errors.map((e) => e.message).join('\n')}`);
      }
      return json.data as T;
    }

    throw lastError ?? new Error('GitHub GraphQL failed after retries');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    const maxRetries = DEFAULT_HTTP_MAX_RETRIES;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers: this.headers('rest'),
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (networkError) {
        lastError = new Error(`GitHub REST ${method} ${url} network error: ${String(networkError)}`);
        if (attempt === maxRetries) {
          throw lastError;
        }
        await sleepBackoff(attempt);
        continue;
      }

      if (response.ok) {
        if (response.status === 204) {
          return undefined as T;
        }
        return response.json() as Promise<T>;
      }

      const text = truncateResponseText(await response.text());
      lastError = new Error(`GitHub REST ${method} ${url} failed: ${response.status} ${text}`);

      if (!isRetryableHttpStatus(response.status) || attempt === maxRetries) {
        throw lastError;
      }

      const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('Retry-After'));
      await sleepBackoff(attempt, retryAfterSeconds);
    }

    throw lastError ?? new Error(`GitHub REST ${method} ${url} failed after ${maxRetries} retries`);
  }

  /**
   * Carrega threads de review, comentários de thread e comentários da PR com paginação completa.
   */
  async fetchPullRequestContextData(
    pullRequestNumber: number,
    log?: (msg: string) => void,
  ): Promise<GithubPullRequestContextData> {
    let headRefOid = '';
    let threadPages = 0;
    let prCommentPages = 0;
    let threadsWithCommentPagination = 0;

    const rawThreads = await paginateGraphqlConnection(async (after) => {
      threadPages++;
      const data = await this.graphql<ReviewThreadsPageResponse>(
        `
          query GetPrReviewThreadsPage(
            $owner: String!
            $name: String!
            $number: Int!
            $pageSize: Int!
            $after: String
          ) {
            repository(owner: $owner, name: $name) {
              pullRequest(number: $number) {
                headRefOid
                reviewThreads(first: $pageSize, after: $after) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  nodes {
                    id
                    isResolved
                    path
                    line
                    comments(first: ${GITHUB_THREAD_COMMENTS_PAGE_SIZE}) {
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                      nodes {
                        id
                        databaseId
                        body
                        author {
                          login
                        }
                        createdAt
                      }
                    }
                  }
                }
              }
            }
          }
        `,
        {
          owner: this.owner,
          name: this.repository,
          number: pullRequestNumber,
          pageSize: GITHUB_REVIEW_THREADS_PAGE_SIZE,
          after,
        },
      );

      headRefOid = data.repository.pullRequest.headRefOid;
      const connection = data.repository.pullRequest.reviewThreads;
      return { nodes: connection.nodes, pageInfo: connection.pageInfo };
    });

    const reviewThreads: GithubReviewThreadNode[] = [];
    for (const thread of rawThreads) {
      let comments = [...(thread.comments?.nodes ?? [])];

      if (thread.comments?.pageInfo.hasNextPage) {
        threadsWithCommentPagination++;
        const extra = await paginateGraphqlConnection(
          async (after) => {
            const data = await this.graphql<ThreadCommentsPageResponse>(
              `
              query GetThreadCommentsPage($threadId: ID!, $pageSize: Int!, $after: String) {
                node(id: $threadId) {
                  ... on PullRequestReviewThread {
                    comments(first: $pageSize, after: $after) {
                      pageInfo {
                        hasNextPage
                        endCursor
                      }
                      nodes {
                        id
                        databaseId
                        body
                        author {
                          login
                        }
                        createdAt
                      }
                    }
                  }
                }
              }
            `,
              {
                threadId: thread.id,
                pageSize: GITHUB_THREAD_COMMENTS_PAGE_SIZE,
                after,
              },
            );

            const connection = data.node?.comments;
            return {
              nodes: connection?.nodes ?? [],
              pageInfo: connection?.pageInfo ?? { hasNextPage: false, endCursor: null },
            };
          },
          thread.comments.pageInfo.endCursor,
        );

        comments.push(...extra);
      }

      reviewThreads.push({
        id: thread.id,
        isResolved: thread.isResolved,
        path: thread.path,
        line: thread.line,
        comments,
      });
    }

    const prComments = await paginateGraphqlConnection(async (after) => {
      prCommentPages++;
      const data = await this.graphql<PrCommentsPageResponse>(
        `
          query GetPrCommentsPage($owner: String!, $name: String!, $number: Int!, $pageSize: Int!, $after: String) {
            repository(owner: $owner, name: $name) {
              pullRequest(number: $number) {
                comments(first: $pageSize, after: $after) {
                  pageInfo {
                    hasNextPage
                    endCursor
                  }
                  nodes {
                    id
                    databaseId
                    body
                    author {
                      login
                    }
                    createdAt
                  }
                }
              }
            }
          }
        `,
        {
          owner: this.owner,
          name: this.repository,
          number: pullRequestNumber,
          pageSize: GITHUB_PR_COMMENTS_PAGE_SIZE,
          after,
        },
      );

      const connection = data.repository.pullRequest.comments;
      return { nodes: connection.nodes, pageInfo: connection.pageInfo };
    });

    if (threadPages > 1) {
      log?.(
        `GitHub: paginated review threads — ${reviewThreads.length} thread(s) em ${threadPages} página(s).`,
      );
    }
    if (prCommentPages > 1) {
      log?.(`GitHub: paginated PR comments — ${prComments.length} comentário(s) em ${prCommentPages} página(s).`);
    }
    if (threadsWithCommentPagination > 0) {
      log?.(
        `GitHub: paginated thread comments em ${threadsWithCommentPagination} thread(s) com mais de ${GITHUB_THREAD_COMMENTS_PAGE_SIZE} comentários.`,
      );
    }

    return { headRefOid, reviewThreads, prComments };
  }
}
