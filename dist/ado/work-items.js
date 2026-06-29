import { stripHtml } from './utils.js';
import { sanitizeUserProvidedContent } from '../agent/input-sanitization.js';
function getFieldText(fields, fieldName) {
    const value = fields[fieldName];
    return typeof value === 'string' ? stripHtml(value) : '';
}
function getWorkItemTitle(fields) {
    const title = fields['System.Title'];
    return typeof title === 'string' ? title.trim() : '';
}
function getWorkItemType(fields) {
    const type = fields['System.WorkItemType'];
    return typeof type === 'string' ? type.trim() : 'Work Item';
}
function isTaskType(type) {
    return type.toLowerCase() === 'task';
}
function isUserStoryLikeType(type) {
    const normalized = type.toLowerCase();
    return (normalized === 'user story' ||
        normalized === 'product backlog item' ||
        normalized === 'feature' ||
        normalized === 'epic' ||
        normalized === 'issue');
}
function formatWorkItemLabel(item) {
    return `'${item.title}' (#${item.id})`;
}
/** Mensagem de log quando work items ADO são carregados para o prompt do agente. */
export function formatWorkItemsLoadedLogMessage(summaries) {
    if (summaries.length === 0) {
        return '';
    }
    const userStories = summaries.filter((item) => isUserStoryLikeType(item.type));
    const tasks = summaries.filter((item) => isTaskType(item.type));
    const others = summaries.filter((item) => !isUserStoryLikeType(item.type) && !isTaskType(item.type));
    const storyLabels = [...userStories, ...others].map(formatWorkItemLabel);
    const taskLabels = tasks.map((item, index) => `task ${index + 1}: ${formatWorkItemLabel(item)}`);
    const usBracket = storyLabels.length > 0 ? storyLabels.join(', ') : '—';
    const tasksBracket = taskLabels.length > 0 ? taskLabels.join(', ') : '—';
    return `Work Items loaded successfully: [${usBracket}], [${tasksBracket}]`;
}
function toWorkItemSummary(workItem) {
    return {
        id: workItem.id,
        type: getWorkItemType(workItem.fields),
        title: getWorkItemTitle(workItem.fields) || `(no title #${workItem.id})`,
    };
}
export async function getPullRequestWorkItemContext(client, pullRequestId, maxWorkItems = 10, log) {
    try {
        const linked = await client.get(`/pullRequests/${pullRequestId}/workitems?api-version=7.1`);
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
            log?.(`Work items truncated for the prompt: ${limitedIds.length}/${workItemIds.length} (limit ${maxWorkItems}).`);
        }
        return { workItemIds: limitedIds, contextForLlm, summaries };
    }
    catch (error) {
        log?.(`Warning: failed to load PR work items: ${String(error)}`);
        return { workItemIds: [], contextForLlm: '', summaries: [] };
    }
}
async function fetchWorkItems(client, ids) {
    const url = `https://dev.azure.com/${client.organization}/${client.project}/_apis/wit/workitems?ids=${ids.join(',')}&$expand=all&api-version=7.1`;
    return client.get(url);
}
export function formatWorkItemSection(workItem) {
    const fields = workItem.fields;
    const type = getWorkItemType(fields);
    const title = getWorkItemTitle(fields);
    let section = `### Work Item #${workItem.id} — ${type}`;
    if (title) {
        section += `\n\n${sanitizeUserProvidedContent(`Work Item #${workItem.id} — Title`, title, 500)}`;
    }
    section += `\n- **State:** ${fields['System.State']}`;
    const description = getFieldText(fields, 'System.Description');
    if (description) {
        section += `\n\n${sanitizeUserProvidedContent(`Work Item #${workItem.id} — Description`, description)}`;
    }
    const acceptanceCriteria = getFieldText(fields, 'Microsoft.VSTS.Common.AcceptanceCriteria');
    if (acceptanceCriteria) {
        section += `\n\n${sanitizeUserProvidedContent(`Work Item #${workItem.id} — Acceptance Criteria`, acceptanceCriteria)}`;
    }
    return section;
}
//# sourceMappingURL=work-items.js.map