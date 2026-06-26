
import { AdoClient } from './client.js';
import { stripHtml } from './utils.js';
import type { AdoWorkItemsResponse } from './types.js';

export interface WorkItemSummary {
  id: number;
  type: string;
  title: string;
}

function getFieldText(fields: Record<string, unknown>, fieldName: string): string {
  const value = fields[fieldName];
  return typeof value === 'string' ? stripHtml(value) : '';
}

function getWorkItemTitle(fields: Record<string, unknown>): string {
  const title = fields['System.Title'];
  return typeof title === 'string' ? title.trim() : '';
}

function getWorkItemType(fields: Record<string, unknown>): string {
  const type = fields['System.WorkItemType'];
  return typeof type === 'string' ? type.trim() : 'Work Item';
}

function isTaskType(type: string): boolean {
  return type.toLowerCase() === 'task';
}

function isUserStoryLikeType(type: string): boolean {
  const normalized = type.toLowerCase();
  return (
    normalized === 'user story' ||
    normalized === 'product backlog item' ||
    normalized === 'feature' ||
    normalized === 'epic' ||
    normalized === 'issue'
  );
}

function formatWorkItemLabel(item: WorkItemSummary): string {
  return `'${item.title}' (#${item.id})`;
}

/** Mensagem de log quando work items ADO são carregados para o prompt do agente. */
export function formatWorkItemsLoadedLogMessage(summaries: WorkItemSummary[]): string {
  if (summaries.length === 0) {
    return '';
  }

  const userStories = summaries.filter((item) => isUserStoryLikeType(item.type));
  const tasks = summaries.filter((item) => isTaskType(item.type));
  const others = summaries.filter(
    (item) => !isUserStoryLikeType(item.type) && !isTaskType(item.type),
  );

  const storyLabels = [...userStories, ...others].map(formatWorkItemLabel);
  const taskLabels = tasks.map((item, index) => `task ${index + 1}: ${formatWorkItemLabel(item)}`);

  const usBracket = storyLabels.length > 0 ? storyLabels.join(', ') : '—';
  const tasksBracket = taskLabels.length > 0 ? taskLabels.join(', ') : '—';

  return `Work Items carregados com sucesso: [${usBracket}], [${tasksBracket}]`;
}

function toWorkItemSummary(workItem: { id: number; fields: Record<string, unknown> }): WorkItemSummary {
  return {
    id: workItem.id,
    type: getWorkItemType(workItem.fields),
    title: getWorkItemTitle(workItem.fields) || `(sem título #${workItem.id})`,
  };
}

export async function getPullRequestWorkItemContext(
  client: AdoClient,
  pullRequestId: number,
  maxWorkItems = 10,
  log?: (msg: string) => void,
): Promise<{ workItemIds: number[]; contextForLlm: string; summaries: WorkItemSummary[] }> {
  try {
    const linked = await client.get<{ value: Array<{ id: string }> }>(
      `/pullRequests/${pullRequestId}/workitems?api-version=7.1`,
    );

    const workItemIds = linked.value.map((wi) => Number(wi.id)).filter((id) => !Number.isNaN(id));
    if (workItemIds.length === 0) {
      return { workItemIds: [], contextForLlm: '', summaries: [] };
    }

    const limitedIds = workItemIds.slice(0, maxWorkItems);
    const details = await fetchWorkItems(client, limitedIds);
    const summaries = details.value.map(toWorkItemSummary);

    const sections = details.value.map((wi) => formatWorkItemSection(wi));
    const contextForLlm = `## Linked Work Items\n\n${sections.join('\n\n---\n\n')}`;

    const loadedMessage = formatWorkItemsLoadedLogMessage(summaries);
    if (loadedMessage) {
      log?.(loadedMessage);
    }

    if (workItemIds.length > limitedIds.length) {
      log?.(
        `Work items truncados para o prompt: ${limitedIds.length}/${workItemIds.length} (limite ${maxWorkItems}).`,
      );
    }

    return { workItemIds: limitedIds, contextForLlm, summaries };
  } catch (error) {
    log?.(`Warning: failed to load PR work items: ${String(error)}`);
    return { workItemIds: [], contextForLlm: '', summaries: [] };
  }
}

async function fetchWorkItems(client: AdoClient, ids: number[]): Promise<AdoWorkItemsResponse> {
  const url = `https://dev.azure.com/${client.organization}/${client.project}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=all&api-version=7.1`;
  return client.get<AdoWorkItemsResponse>(url);
}

function formatWorkItemSection(workItem: { id: number; fields: Record<string, unknown> }): string {
  const fields = workItem.fields;
  let section = `### Work Item #${workItem.id} — ${fields['System.WorkItemType']}
- **Title:** ${fields['System.Title']}
- **State:** ${fields['System.State']}`;

  const description = getFieldText(fields, 'System.Description');
  if (description) {
    section += `\n\n**Description:**\n${description}`;
  }

  const acceptanceCriteria = getFieldText(fields, 'Microsoft.VSTS.Common.AcceptanceCriteria');
  if (acceptanceCriteria) {
    section += `\n\n**Acceptance Criteria:**\n${acceptanceCriteria}`;
  }

  return section;
}


