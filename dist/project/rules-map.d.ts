export interface RuleDescriptor {
    relativePath: string;
    description: string;
    globs: string[];
    alwaysApply: boolean;
}
export interface RulesMapResult {
    alwaysApplyRules: string[];
    fileRules: Array<{
        file: string;
        rules: string[];
    }>;
    uniqueRules: string[];
    contextForPrompt: string;
}
/** Converte glob simples para RegExp (suficiente para `.cursor/rules/*.mdc`). */
export declare function globToRegExp(glob: string): RegExp;
export declare function matchesGlob(filePath: string, glob: string): boolean;
export declare function loadProjectRules(repoRoot: string): RuleDescriptor[];
export declare function buildRulesMap(repoRoot: string, changedFiles: string[]): RulesMapResult;
//# sourceMappingURL=rules-map.d.ts.map