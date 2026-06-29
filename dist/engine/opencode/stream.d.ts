import type { ReviewerConfig } from '../../config.js';
import type { Logger } from '../../logger.js';
export interface OpencodeRunResult {
    sessionId: string;
    runId: string;
    status: string;
    fullText: string;
    metrics: Record<string, number>;
}
export interface RunOpencodeOptions {
    name: string;
    prompt: string;
    resumeSessionId?: string;
}
export declare function runOpencodeStream(config: ReviewerConfig, options: RunOpencodeOptions, logger: Logger): Promise<OpencodeRunResult>;
//# sourceMappingURL=stream.d.ts.map