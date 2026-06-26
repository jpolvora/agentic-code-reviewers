/** Tamanhos de página GraphQL GitHub (limites da API). */
export const GITHUB_REVIEW_THREADS_PAGE_SIZE = 100;
export const GITHUB_THREAD_COMMENTS_PAGE_SIZE = 50;
export const GITHUB_PR_COMMENTS_PAGE_SIZE = 100;

export interface GithubReviewCommentNode {
  id: string;
  databaseId: number;
  body: string;
  author: { login: string } | null;
  createdAt: string;
}

export interface GithubReviewThreadNode {
  id: string;
  isResolved: boolean;
  path: string;
  line: number | null;
  comments: GithubReviewCommentNode[];
}

export interface GithubPrCommentNode {
  id: string;
  databaseId: number;
  body: string;
  author: { login: string } | null;
  createdAt: string;
}

export interface GithubPullRequestContextData {
  headRefOid: string;
  reviewThreads: GithubReviewThreadNode[];
  prComments: GithubPrCommentNode[];
}
