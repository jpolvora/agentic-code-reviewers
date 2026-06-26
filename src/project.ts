import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ProjectLayout {
  applicationDir: string | null;
  angularAppDir: string | null;
}

export interface ResolvedProject {
  runnerRoot: string;
  repoRoot: string;
  projectName: string;
  codeReviewSkillPath: string;
  systemPromptPath: string;
  layout: ProjectLayout;
  version: string;
}

export class ProjectValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProjectValidationError';
  }
}

/** Encerra o processo com mensagem explícita (fail-fast para CI/CD). */
export function failFast(message: string): never {
  throw new ProjectValidationError(message);
}

/** Localiza a raiz do pacote cursor-reviewer (scripts/cursor-reviewer). */
export function resolveRunnerRoot(fromModuleUrl: string): string {
  let current = dirname(fileURLToPath(fromModuleUrl));

  while (true) {
    const markerSource = resolve(current, 'src/index.ts');
    const markerDist = resolve(current, 'dist/index.js');
    const pkgPath = resolve(current, 'package.json');

    if ((existsSync(markerSource) || existsSync(markerDist)) && existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
        if (pkg.name?.includes('cursor-reviewer')) {
          return resolve(current);
        }
      } catch {
        // continua subindo
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      failFast(
        'Não foi possível localizar scripts/cursor-reviewer. ' +
          'Copie o subprojeto completo para scripts/cursor-reviewer na raiz do repositório alvo.',
      );
    }
    current = parent;
  }
}

export function detectProjectName(repoRoot: string): string {
  return basename(resolve(repoRoot));
}

export function detectProjectLayout(repoRoot: string): ProjectLayout {
  return {
    applicationDir: findApplicationProjectDir(repoRoot),
    angularAppDir: findAngularAppDir(repoRoot),
  };
}

function findApplicationProjectDir(repoRoot: string): string | null {
  const srcDir = resolve(repoRoot, 'src');
  if (!existsSync(srcDir)) {
    return null;
  }

  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (entry.name.endsWith('.Application')) {
      return resolve(srcDir, entry.name);
    }
  }

  return null;
}

function findAngularAppDir(repoRoot: string): string | null {
  const candidates = ['angular/src/app', 'src/frontend/src/app', 'client/src/app', 'apps/web/src/app'];

  for (const relative of candidates) {
    const full = resolve(repoRoot, relative);
    if (existsSync(full)) {
      return full;
    }
  }

  return null;
}

/**
 * Valida harness do projeto alvo e retorna paths resolvidos.
 * Falha imediatamente se a estrutura ou as skills obrigatórias estiverem ausentes.
 */
export function resolveProject(
  fromModuleUrl: string,
  repoRootOverride?: string,
): ResolvedProject {
  const runnerRoot = resolveRunnerRoot(fromModuleUrl);
  let repoRoot: string;
  if (repoRootOverride) {
    repoRoot = resolve(repoRootOverride);
  } else {
    // Tenta encontrar a pasta .git subindo a partir do runnerRoot
    let current = runnerRoot;
    let foundGit = false;
    while (true) {
      if (existsSync(resolve(current, '.git'))) {
        foundGit = true;
        break;
      }
      const parent = dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }

    if (foundGit) {
      repoRoot = current;
    } else {
      // Fallback legado se não encontrar .git na subida
      repoRoot = resolve(runnerRoot, '../../');
    }
  }

  if (!existsSync(resolve(repoRoot, '.git')) && !repoRootOverride) {
    failFast(
      `Repositório git não encontrado em ${repoRoot}.\n` +
        'Execute o reviewer apontando para um repositório git válido.',
    );
  }

  const codeReviewSkillPath = resolve(runnerRoot, 'skills/CODE_REVIEW.md');
  const systemPromptPath = resolve(runnerRoot, 'skills/SYSTEM_PROMPT.md');

  if (!existsSync(codeReviewSkillPath)) {
    failFast(`Skill obrigatória ausente: ${codeReviewSkillPath}`);
  }
  if (!existsSync(systemPromptPath)) {
    failFast(`System Prompt obrigatório ausente: ${systemPromptPath}`);
  }

  const pkgPath = resolve(runnerRoot, 'package.json');
  let version = 'unknown';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    if (pkg.version) {
      version = pkg.version;
    }
  } catch {
    // ignore
  }

  return {
    runnerRoot,
    repoRoot,
    projectName: detectProjectName(repoRoot),
    codeReviewSkillPath,
    systemPromptPath,
    layout: detectProjectLayout(repoRoot),
    version,
  };
}
