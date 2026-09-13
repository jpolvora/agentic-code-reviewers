import { type DiffOptions } from './diff.js';
export type DiffPromptMode = 'full' | 'per-file' | 'empty';
export interface DiffPromptSection {
    mode: DiffPromptMode;
    content: string;
    totalBytes: number;
    includedFiles: number;
    omittedFiles: number;
}
/** Teto de bytes do diff embutido no prompt (~100 KB). */
export declare const MAX_DIFF_PROMPT_BYTES = 100000;
/**
 * Monta seção de diff para o prompt do agente.
 * PR pequena: unified diff completo. PR grande: por arquivo até o teto de bytes.
 */
export declare function buildDiffPromptSection(cwd: string, diffRange: string, files: string[], options?: DiffOptions, maxBytes?: number): DiffPromptSection;
//# sourceMappingURL=diff-prompt.d.ts.map