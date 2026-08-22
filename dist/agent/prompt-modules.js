import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchesGlob } from '../project/rules-map.js';
export const TASK_MODULES = [
    {
        id: 'security',
        fileName: 'security.md',
        globs: [
            '**/auth/**',
            '**/security/**',
            '**/*Auth*',
            '**/*Login*',
            '**/*Permission*',
            '**/*.sql',
            '**/*Controller.cs',
        ],
    },
    {
        id: 'performance',
        fileName: 'performance.md',
        globs: ['**/*Repository*', '**/*Query*', '**/*DbContext*', '**/*Service*.cs', '**/*api/**'],
    },
    {
        id: 'concurrency',
        fileName: 'concurrency.md',
        globs: ['**/*Async*', '**/*Task*', '**/*Lock*', '**/*Concurrent*', '**/*Background*'],
    },
    {
        id: 'tests',
        fileName: 'tests.md',
        globs: ['**/test/**', '**/tests/**', '**/*.spec.ts', '**/*.test.ts', '**/*Tests.cs', '**/*Test.cs'],
    },
];
export function selectPromptModuleIds(changedFiles, forcedModules) {
    const forced = forcedModules ?? [];
    const files = changedFiles ?? [];
    if (forced.length > 0) {
        const selected = [...new Set(forced.map((m) => m.trim().toLowerCase()).filter(Boolean))];
        const validIds = new Set(TASK_MODULES.map((m) => m.id));
        const invalid = selected.filter((id) => !validIds.has(id));
        if (invalid.length > 0) {
            console.warn(`[prompt-modules] Invalid module IDs ignored: ${invalid.join(', ')}. Valid: ${[...validIds].join(', ')}`);
        }
        return selected.filter((id) => validIds.has(id));
    }
    const selected = new Set();
    for (const file of files) {
        const normalized = file.replace(/\\/g, '/');
        for (const mod of TASK_MODULES) {
            if (mod.globs.some((glob) => matchesGlob(normalized, glob))) {
                selected.add(mod.id);
            }
        }
    }
    return [...selected];
}
export function loadPromptModuleContents(runnerRoot, moduleIds) {
    const sections = [];
    const tasksDir = resolve(runnerRoot, 'skills', 'tasks');
    for (const id of moduleIds) {
        const descriptor = TASK_MODULES.find((m) => m.id === id);
        if (!descriptor)
            continue;
        const path = resolve(tasksDir, descriptor.fileName);
        if (!existsSync(path))
            continue;
        try {
            const content = readFileSync(path, 'utf8').trim();
            if (content) {
                sections.push(content);
            }
        }
        catch {
            // skip unreadable module
        }
    }
    return sections;
}
//# sourceMappingURL=prompt-modules.js.map