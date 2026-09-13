import { AdoClient } from './client.js';
export interface WorkItemSummary {
    id: number;
    type: string;
    title: string;
}
/** Mensagem de log quando work items ADO são carregados para o prompt do agente. */
export declare function formatWorkItemsLoadedLogMessage(summaries: WorkItemSummary[]): string;
export declare function getPullRequestWorkItemContext(client: AdoClient, pullRequestId: number, maxWorkItems?: number, log?: (msg: string) => void): Promise<{
    workItemIds: number[];
    contextForLlm: string;
    summaries: WorkItemSummary[];
}>;
export declare function formatWorkItemSection(workItem: {
    id: number;
    fields: Record<string, unknown>;
}): string;
//# sourceMappingURL=work-items.d.ts.map