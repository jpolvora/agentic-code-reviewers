import { buildAgentPrompt } from './prompt.js';
export async function runCodeReviewAgent(config, context, engine, logger) {
    const prompt = buildAgentPrompt(config, context);
    logger.info(`Score mínimo para threads (prompt + gate): ${config.scoreMin}`);
    if (config.engine === 'opencode') {
        logger.info('Harness do repositório: prompt do runner + instructions OpenCode (servidor embutido)');
    }
    else {
        logger.info('Harness do repositório: settingSources project (Cursor SDK)');
    }
    return engine.run(config, {
        name: `${config.projectName} Cursor Reviewer`,
        prompt,
    }, logger);
}
//# sourceMappingURL=runner.js.map