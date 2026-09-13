export interface TaskModuleDescriptor {
    id: string;
    fileName: string;
    globs: string[];
}
export declare const TASK_MODULES: TaskModuleDescriptor[];
export declare function selectPromptModuleIds(changedFiles: string[] | undefined, forcedModules: string[] | undefined): string[];
export declare function loadPromptModuleContents(runnerRoot: string, moduleIds: string[]): string[];
//# sourceMappingURL=prompt-modules.d.ts.map