import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { matchesGlob } from '../project/rules-map.js';

export interface TaskModuleDescriptor {
  id: string;
  fileName: string;
  globs: string[];
}

export const TASK_MODULES: TaskModuleDescriptor[] = [
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

export function selectPromptModuleIds(changedFiles: string[] | undefined, forcedModules: string[] | undefined): string[] {
  const forced = forcedModules ?? [];
  const files = changedFiles ?? [];
  if (forced.length > 0) {
    return [...new Set(forced.map((m) => m.trim().toLowerCase()).filter(Boolean))];
  }

  const selected = new Set<string>();
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

export function loadPromptModuleContents(
  runnerRoot: string,
  moduleIds: string[],
): string[] {
  const sections: string[] = [];
  const tasksDir = resolve(runnerRoot, 'skills', 'tasks');

  for (const id of moduleIds) {
    const descriptor = TASK_MODULES.find((m) => m.id === id);
    if (!descriptor) continue;
    const path = resolve(tasksDir, descriptor.fileName);
    if (!existsSync(path)) continue;
    try {
      const content = readFileSync(path, 'utf8').trim();
      if (content) {
        sections.push(content);
      }
    } catch {
      // skip unreadable module
    }
  }

  return sections;
}
