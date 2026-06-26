import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { failFast, resolveProject, type ProjectLayout } from '../project.js';

const moduleUrl = import.meta.url;

export const FIXTURES_ROOT = resolve(resolveProject(moduleUrl).runnerRoot, 'fixtures/seed');

export interface SeedTarget {
  id: string;
  fixturePath: string;
  repoPath: string;
}

export const EXPECTED_SCENARIOS_PATH = resolve(FIXTURES_ROOT, 'expected-scenarios.json');

let cachedProject = resolveProject(moduleUrl);

export function getRunnerRoot(): string {
  return cachedProject.runnerRoot;
}

export function getRepoRoot(): string {
  return cachedProject.repoRoot;
}

export function checkSeedLayout(layout: ProjectLayout): boolean {
  return !!(layout.applicationDir && layout.angularAppDir);
}

function assertSeedLayout(layout: ProjectLayout): void {
  if (!layout.applicationDir) {
    failFast(
      'Seed test requer camada Application ABP em src/*Application.\n' +
        `  Repositório: ${cachedProject.repoRoot}\n` +
        '  Nenhuma pasta *Application encontrada em src/.',
    );
  }

  if (!layout.angularAppDir) {
    failFast(
      'Seed test requer frontend Angular (ex.: angular/src/app).\n' +
        `  Repositório: ${cachedProject.repoRoot}\n` +
        '  Nenhum diretório de app Angular detectado.',
    );
  }
}

export function buildSeedTargets(): SeedTarget[] {
  cachedProject = resolveProject(moduleUrl);
  const layout = cachedProject.layout;
  if (!checkSeedLayout(layout)) {
    return [];
  }
  assertSeedLayout(layout);

  const applicationDir = layout.applicationDir!;
  const angularAppDir = layout.angularAppDir!;

  return [
    {
      id: 'backend',
      fixturePath: resolve(FIXTURES_ROOT, 'backend/CursorReviewerSeedAppService.cs'),
      repoPath: resolve(applicationDir, 'CursorReviewerSeed/CursorReviewerSeedAppService.cs'),
    },
    {
      id: 'frontend-ts',
      fixturePath: resolve(FIXTURES_ROOT, 'frontend/cursor-reviewer-seed.component.ts'),
      repoPath: resolve(angularAppDir, 'cursor-reviewer-seed/cursor-reviewer-seed.component.ts'),
    },
    {
      id: 'frontend-html',
      fixturePath: resolve(FIXTURES_ROOT, 'frontend/cursor-reviewer-seed.component.html'),
      repoPath: resolve(angularAppDir, 'cursor-reviewer-seed/cursor-reviewer-seed.component.html'),
    },
  ];
}

/** @deprecated Use buildSeedTargets(). */
export function getSeedTargets(): SeedTarget[] {
  return buildSeedTargets();
}
