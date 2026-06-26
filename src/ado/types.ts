export type ReviewSeverity = 'critical' | 'warning' | 'suggestion';
export type DeveloperAction = 'fix-code' | 'resolve-comment' | 'escalate';

export interface CodeReviewItem {
  fileName: string;
  lineNumber: number;
  severity: ReviewSeverity;
  comment: string;
  /** Score 0–10: orientação de severidade para o desenvolvedor */
  score?: number;
  developerAction?: DeveloperAction;
  /** Análise profunda: caminho de execução, invariants, coerência com WI */
  analysis?: string;
  /** Arquivos/caminhos adjacentes analisados */
  impactPaths?: string[];
  /** Estratégia de correção sugerida para o desenvolvedor */
  suggestedFix?: string;
  /** Agrupamento de ocorrências irmãs do mesmo defeito em outros arquivos */
  relatedOccurrences?: { fileName: string; lineNumber: number }[];
}

export interface ResolvedThreadItem {
  threadId?: string | number;
  fileName?: string;
  lineNumber?: number;
  note?: string;
}

export interface CodeReviewResponse {
  reviews: CodeReviewItem[];
  resolvedThreads: ResolvedThreadItem[];
  reviewSummary: string;
}

export interface ParsedCodeReviewResponse extends CodeReviewResponse {
  hasCriticalReviews: boolean;
  reviewsJson: string;
}

export interface ActiveThreadInfo {
  threadId: string;
  filePath: string;
  lineNumber: number;
  status: string;
  summary: string;
  botCommentId: string | number;
  hasResolutionReply: boolean;
}

export interface PendingPrThread {
  threadId: string;
  status: string;
  filePath: string | null;
  lineNumber: number | null;
  author: string;
  isBot: boolean;
  botTag: string | null;
  summary: string;
}

export interface ReviewContextResult {
  existingKeys: Map<string, boolean>;
  contextForLlm: string;
  activeThreads: ActiveThreadInfo[];
  allThreads: AdoThreadsResponse | null;
  pendingThreads: PendingPrThread[];
}

export interface AdoThreadComment {
  id: number;
  parentCommentId: number;
  content: string;
  commentType: number;
  isDeleted?: boolean;
  author?: { displayName?: string };
}

export interface AdoThread {
  id: number;
  status: string;
  isDeleted?: boolean;
  threadContext?: {
    filePath: string;
    rightFileStart?: { line: number; offset?: number };
  };
  comments: AdoThreadComment[];
}

export interface AdoThreadsResponse {
  value: AdoThread[];
}

export interface AdoWorkItem {
  id: number;
  fields: Record<string, unknown>;
}

export interface AdoWorkItemsResponse {
  value: AdoWorkItem[];
}

export interface PostingPlan {
  reviewsJson: string;
  reviewSummary: string;
  postSummary: boolean;
}

export interface PostedReviewThread {
  threadId: string;
  botCommentId: string | number;
  review: CodeReviewItem;
}

export interface GateEvaluation {
  /** Indica issues de review abertas (threads novas ou pendentes). Não altera o exit code da pipeline. */
  shouldFail: boolean;
  reason: string;
  newReviewsCount: number;
  resolvedCount: number;
  pendingThreadCount: number;
  pendingThreads: PendingPrThread[];
  severities: Record<ReviewSeverity, number>;
}
