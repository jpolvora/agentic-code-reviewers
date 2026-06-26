import type { CodeReviewItem } from './types.js';

function getSeverityLabel(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🛑 **CRITICAL:**';
    case 'warning':
      return '⚠️ **WARNING:**';
    case 'suggestion':
      return '💡 **SUGGESTION:**';
    default:
      return 'ℹ️ **NOTE:**';
  }
}

/**
 * O Azure DevOps não suporta o bloco ```suggestion (recurso exclusivo do GitHub:
 * botão "Apply suggestion"). Em PRs do ADO ele renderiza como código comum, sem
 * ação. Normalizamos a cerca para um bloco de código neutro, evitando sugerir
 * um comportamento inexistente.
 */
function normalizeFixFences(text: string, isGithub = false): string {
  if (isGithub) return text;
  return text.replace(/```suggestion\b/gi, '```');
}

function removeSeverityPrefix(text: string): string {
  let result = text.trimStart();
  const prefixPattern = /^(?:(?:🛑|⚠️|💡|ℹ️|🔴|⛔)\s*)?\*{0,2}(?:CRITICAL|WARNING|SUGGESTION|NOTE)\*{0,2}:\s*/i;

  while (prefixPattern.test(result)) {
    result = result.replace(prefixPattern, '').trimStart();
  }

  return result.replace(/^\*\*\s*/, '').trimStart();
}

export function formatCommentForPosting(
  review: CodeReviewItem,
  botTag: string,
  isGithub = false,
): string {
  let body = review.comment;

  if (body.startsWith(botTag)) {
    body = body.slice(botTag.length).replace(/^[\n\r]+/, '');
  }

  body = removeSeverityPrefix(body);
  const severityLabel = getSeverityLabel(review.severity);

  const parts = [botTag];

  let fixBlock = '';
  if (review.suggestedFix) {
    const trimmedFix = normalizeFixFences(review.suggestedFix.trim(), isGithub);
    if (trimmedFix.includes('```')) {
      fixBlock = `\n\n**Correção sugerida:**\n\n${trimmedFix}`;
    } else {
      fixBlock = `\n\n**Correção sugerida:**\n\n\`\`\`\n${trimmedFix}\n\`\`\``;
    }
  }

  const detailsLines: string[] = [];
  if (review.score != null) {
    detailsLines.push(
      `**Score:** ${review.score}/10 | **Ação dev:** ${review.developerAction ?? 'n/a'}`
    );
  }
  if (review.analysis) {
    detailsLines.push(`**Análise:**\n${review.analysis}`);
  }
  if (review.impactPaths && review.impactPaths.length > 0) {
    detailsLines.push(`**Caminhos analisados:** ${review.impactPaths.join(', ')}`);
  }

  const detailsBlock =
    detailsLines.length > 0
      ? `\n\n<details>\n<summary>🔍 Detalhes da Análise IA</summary>\n\n${detailsLines.join('\n\n')}\n</details>`
      : '';

  if (!body.trim()) {
    return `${parts.join('\n')}\n\n${severityLabel}${detailsBlock}${fixBlock}`;
  }

  return (
    `${parts.join('\n')}\n\n${severityLabel} ${body}` +
    fixBlock +
    detailsBlock
  );
}
