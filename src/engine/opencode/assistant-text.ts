import type { AssistantMessage, Part } from '@opencode-ai/sdk';

/** Follow-up when the first turn returns no usable assistant text (reasoning-only / truncated). */
export const EMPTY_ASSISTANT_TEXT_CONTINUATION = [
  'Your previous turn ended without a usable final text answer',
  '(empty text parts, output length limit, or abort mid-response).',
  'Reply now with ONLY the JSON object required by the system prompt:',
  '{"reviews":[],"resolvedThreads":[],"reviewSummary":""}',
  'Populate reviews when you have proven findings. No markdown fences required. No preamble.',
  'Do not repeat the system prompt or the diff.',
].join(' ');

export function extractTextFromParts(parts: Part[]): string {
  return parts
    .filter((part): part is Extract<Part, { type: 'text' }> => part.type === 'text')
    .filter((part) => !part.ignored)
    .map((part) => part.text)
    .join('');
}

export function summarizePartTypes(parts: Part[]): string {
  const counts = new Map<string, number>();
  for (const part of parts) {
    counts.set(part.type, (counts.get(part.type) ?? 0) + 1);
  }
  if (counts.size === 0) return '(none)';
  return [...counts.entries()]
    .map(([type, count]) => `${type}:${count}`)
    .join(', ');
}

export function isRetryableIncompleteAssistant(
  info: AssistantMessage,
  fullText: string,
): boolean {
  if (fullText.trim()) return false;
  if (!info.error) return true;
  return (
    info.error.name === 'MessageOutputLengthError' || info.error.name === 'MessageAbortedError'
  );
}

export function formatIncompleteAssistantDiagnostics(
  info: AssistantMessage,
  parts: Part[],
): string {
  const finish = info.finish ?? 'unknown';
  const errorName = info.error?.name ?? 'none';
  const tokens = info.tokens
    ? `in=${info.tokens.input} out=${info.tokens.output} reasoning=${info.tokens.reasoning}`
    : 'n/a';
  return `finish=${finish}; error=${errorName}; parts=[${summarizePartTypes(parts)}]; tokens={${tokens}}`;
}

export type IncompleteAssistantTurn = {
  info: AssistantMessage;
  parts: Part[];
};

export type IncompleteAssistantRetryResult = {
  turn: IncompleteAssistantTurn;
  fullText: string;
  retried: boolean;
};

/**
 * If the first turn has no usable text (or length/abort error), call `followUp` once.
 * Used by runOpencodeStream so the orchestration path is unit-testable.
 */
export async function resolveIncompleteAssistantTurn(
  first: IncompleteAssistantTurn,
  followUp: () => Promise<IncompleteAssistantTurn>,
  onRetry?: () => void,
): Promise<IncompleteAssistantRetryResult> {
  const firstText = extractTextFromParts(first.parts);
  if (!isRetryableIncompleteAssistant(first.info, firstText)) {
    return { turn: first, fullText: firstText, retried: false };
  }
  onRetry?.();
  const second = await followUp();
  return {
    turn: second,
    fullText: extractTextFromParts(second.parts),
    retried: true,
  };
}

export function mergeAssistantMetrics(
  first: Record<string, number>,
  second: Record<string, number>,
): Record<string, number> {
  const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
  const merged: Record<string, number> = {};
  for (const key of keys) {
    merged[key] = (first[key] ?? 0) + (second[key] ?? 0);
  }
  return merged;
}
