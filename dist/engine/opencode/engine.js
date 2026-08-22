import { runOpencodeStream } from './stream.js';
export class OpencodeEngine {
    engineName = 'opencode';
    async run(config, options, logger) {
        const result = await runOpencodeStream(config, {
            name: options.name,
            prompt: options.prompt,
            resumeSessionId: options.resumeSessionId,
        }, logger);
        return {
            sessionId: result.sessionId,
            runId: result.runId,
            status: result.status,
            fullText: result.fullText,
            metrics: result.metrics,
        };
    }
}
//# sourceMappingURL=engine.js.map