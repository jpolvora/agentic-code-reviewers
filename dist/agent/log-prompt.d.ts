import type { Logger } from '../logger.js';
export declare const PROMPT_START_MARKER = "Inicio Prompt:";
export declare const PROMPT_END_MARKER = "Fim do prompt";
/** True quando cores ANSI podem ser emitidas (terminal local ou pipeline ADO). */
export declare function useAnsiColors(): boolean;
/** Destaca cabeçalhos markdown e separadores do prompt para leitura humana. */
export declare function colorizePromptForDisplay(prompt: string, color: boolean): string;
/**
 * Emite o prompt completo imediatamente antes do envio ao Cursor SDK.
 *
 * - **Azure Pipelines:** seção colapsável `##[group]` / `##[endgroup]` + ANSI opcional.
 * - **Terminal local:** banners coloridos + corpo com destaque de seções markdown.
 */
export declare function logAgentPromptBeforeSend(logger: Logger, prompt: string): void;
//# sourceMappingURL=log-prompt.d.ts.map