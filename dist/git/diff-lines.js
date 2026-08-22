import { normalizeFilePath } from '../ado/utils.js';
/**
 * Parses a unified diff into a map of normalized file paths → changed line numbers
 * on the right (new) side of the diff.
 */
export function parseChangedLinesFromDiff(diffText) {
    const result = new Map();
    if (!diffText?.trim()) {
        return result;
    }
    const lines = diffText.split(/\r?\n/);
    let currentFile = null;
    let rightLine = 0;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('diff --git ')) {
            currentFile = null;
            rightLine = 0;
            continue;
        }
        if (line.startsWith('rename from ') || line.startsWith('rename to ')) {
            if (line.startsWith('rename to ')) {
                const rawPath = line.slice('rename to '.length).trim();
                currentFile = normalizeFilePath(rawPath);
                if (!result.has(currentFile)) {
                    result.set(currentFile, new Set());
                }
            }
            continue;
        }
        if (line.startsWith('+++ ')) {
            const pathPart = line.slice(4).trim();
            if (pathPart === '/dev/null') {
                currentFile = null;
                continue;
            }
            const rawPath = pathPart.startsWith('b/') ? pathPart.slice(2) : pathPart;
            currentFile = normalizeFilePath(rawPath);
            if (!result.has(currentFile)) {
                result.set(currentFile, new Set());
            }
            continue;
        }
        if (line.startsWith('--- ') || line.startsWith('Binary files ') || !currentFile) {
            continue;
        }
        const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
        if (hunkMatch) {
            rightLine = Number.parseInt(hunkMatch[1], 10);
            continue;
        }
        if (line.startsWith('+') && !line.startsWith('+++')) {
            const lineSet = result.get(currentFile);
            lineSet.add(rightLine);
            rightLine++;
            continue;
        }
        if (line.startsWith('-') && !line.startsWith('---')) {
            // Anchor the current right-side position when the file has only deletions,
            // so reviews near deleted code are not silently discarded by safe-outputs.
            const lineSet = result.get(currentFile);
            if (lineSet.size === 0 && rightLine > 0) {
                lineSet.add(rightLine);
            }
            continue;
        }
        if (line.startsWith(' ')) {
            rightLine++;
        }
    }
    return result;
}
/** Returns true when the file/line pair exists in the changed-lines map. */
export function isLineInChangedDiff(changedLines, fileName, lineNumber) {
    if (lineNumber <= 0) {
        return false;
    }
    const normalized = normalizeFilePath(fileName);
    const lines = changedLines.get(normalized);
    if (!lines) {
        const withoutLeading = normalized.startsWith('/') ? normalized.slice(1) : normalized;
        const altLines = changedLines.get(withoutLeading);
        return altLines ? altLines.has(lineNumber) : false;
    }
    return lines.has(lineNumber);
}
//# sourceMappingURL=diff-lines.js.map