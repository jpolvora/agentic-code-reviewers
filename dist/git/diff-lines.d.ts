export type ChangedLinesMap = Map<string, Set<number>>;
/**
 * Parses a unified diff into a map of normalized file paths → changed line numbers
 * on the right (new) side of the diff.
 */
export declare function parseChangedLinesFromDiff(diffText: string): ChangedLinesMap;
/** Returns true when the file/line pair exists in the changed-lines map. */
export declare function isLineInChangedDiff(changedLines: ChangedLinesMap, fileName: string, lineNumber: number): boolean;
//# sourceMappingURL=diff-lines.d.ts.map