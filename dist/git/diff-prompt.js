import { formatDiffSizeKb, getDiffPatch, getFileDiffPatch } from './diff.js';
/** Teto de bytes do diff embutido no prompt (~100 KB). */
export const MAX_DIFF_PROMPT_BYTES = 100_000;
function formatFileSection(file, patch) {
    return `### ${file}\n\n\`\`\`diff\n${patch.trimEnd()}\n\`\`\``;
}
/**
 * Monta seção de diff para o prompt do agente.
 * PR pequena: unified diff completo. PR grande: por arquivo até o teto de bytes.
 */
export function buildDiffPromptSection(cwd, diffRange, files, options = {}, maxBytes = MAX_DIFF_PROMPT_BYTES) {
    if (files.length === 0) {
        return { mode: 'empty', content: '', totalBytes: 0, includedFiles: 0, omittedFiles: 0 };
    }
    const scoped = { ...options, files };
    const fullPatch = getDiffPatch(cwd, diffRange, scoped);
    const fullBytes = Buffer.byteLength(fullPatch, 'utf8');
    if (fullBytes > 0 && fullBytes <= maxBytes) {
        return {
            mode: 'full',
            content: `\`\`\`diff\n${fullPatch.trimEnd()}\n\`\`\``,
            totalBytes: fullBytes,
            includedFiles: files.length,
            omittedFiles: 0,
        };
    }
    const sections = [];
    let usedBytes = 0;
    let included = 0;
    for (const file of files) {
        const patch = getFileDiffPatch(cwd, diffRange, file, options);
        if (!patch.trim()) {
            continue;
        }
        const section = formatFileSection(file, patch);
        const sectionBytes = Buffer.byteLength(section, 'utf8');
        if (usedBytes > 0 && usedBytes + sectionBytes > maxBytes) {
            break;
        }
        sections.push(section);
        usedBytes += sectionBytes;
        included += 1;
    }
    if (included === 0) {
        return {
            mode: 'empty',
            content: '> Diff elegível vazio ou acima do teto de bytes. Use `git diff` via tools nos paths listados acima.',
            totalBytes: 0,
            includedFiles: 0,
            omittedFiles: files.length,
        };
    }
    const omitted = files.length - included;
    const header = omitted > 0
        ? `> Diff por arquivo (${included}/${files.length} incluídos, ${formatDiffSizeKb(usedBytes)}). ` +
            `${omitted} arquivo(s) omitido(s) — use tools para o restante.\n\n`
        : `> Diff por arquivo (${formatDiffSizeKb(usedBytes)}).\n\n`;
    return {
        mode: 'per-file',
        content: header + sections.join('\n\n'),
        totalBytes: usedBytes,
        includedFiles: included,
        omittedFiles: omitted,
    };
}
//# sourceMappingURL=diff-prompt.js.map