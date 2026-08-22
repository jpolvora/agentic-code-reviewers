import { createReviewToolContext, executeReviewTool, isToolAllowed, REVIEW_TOOL_NAMES, } from './review-tools.js';
/** Pre-fetches optional lint/test output for injection when MCP is enabled. */
export function prefetchMcpObservations(config, context) {
    if (!config.mcpEnabled) {
        return [];
    }
    const ctx = createReviewToolContext(config, context);
    const observations = [];
    const prefetchTools = [];
    if (config.mcpLintCmd && isToolAllowed('run_lint', config.mcpTools)) {
        prefetchTools.push('run_lint');
    }
    if (config.mcpTestCmd && isToolAllowed('run_tests', config.mcpTools)) {
        prefetchTools.push('run_tests');
    }
    for (const tool of prefetchTools) {
        const result = executeReviewTool(tool, ctx, config);
        observations.push({ tool, content: result.content, isError: result.isError });
    }
    return observations;
}
export function buildMcpPromptSection(config, observations) {
    if (!config.mcpEnabled) {
        return '';
    }
    const allowed = REVIEW_TOOL_NAMES.filter((t) => isToolAllowed(t, config.mcpTools));
    const lines = [
        '---',
        '',
        '## MCP Review Tools (observação somente leitura)',
        '',
        'O runner expõe ferramentas de contexto. **Não** modifique arquivos, não aplique fixes.',
        '',
        'Ferramentas disponíveis:',
        ...allowed.map((t) => `- \`${t}\``),
        '',
    ];
    if (observations.length > 0) {
        lines.push('### Observações pré-coletadas', '');
        for (const obs of observations) {
            lines.push(`#### ${obs.tool}${obs.isError ? ' (erro)' : ''}`, '', '```', obs.content.trimEnd(), '```', '');
        }
    }
    return lines.join('\n');
}
export function buildOpencodeMcpInstructions(config) {
    if (!config.mcpEnabled) {
        return [];
    }
    return [
        'MCP review tools are enabled by the runner (read-only observation).',
        'Use embedded diff and read/grep tools; do not run destructive commands.',
    ];
}
//# sourceMappingURL=mcp-prompt.js.map