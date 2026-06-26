import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import {
  getDiffBreakdown,
  getDiffFileSummaries,
  getDiffPatch,
  getUncommittedFileNames,
  mergeUniquePaths,
  toShortRef,
} from '../src/git/diff.js';
import { installSeedFixtures } from '../src/seed/install-fixtures.js';
import { buildSeedTargets, getRepoRoot } from '../src/seed/paths.js';
import { uninstallSeedFixtures } from '../src/seed/uninstall-fixtures.js';

function createTempGitRepo(prefix: string): string {
  const baseDir = join(
    tmpdir(),
    `cursor-reviewer-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  mkdirSync(baseDir, { recursive: true });
  return baseDir;
}

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

function initRepo(cwd: string): void {
  runGit(cwd, ['init', '-q']);
  runGit(cwd, ['config', 'user.email', 'cursor-reviewer@example.com']);
  runGit(cwd, ['config', 'user.name', 'Cursor Reviewer Test']);
}

describe('toShortRef', () => {
  it('normaliza refs heads e remotes para nome curto', () => {
    assert.equal(toShortRef('refs/heads/feat/x'), 'feat/x');
    assert.equal(toShortRef('refs/remotes/origin/master'), 'master');
    assert.equal(toShortRef('master'), 'master');
  });
});

describe('mergeUniquePaths', () => {
  it('deduplica paths equivalentes com barras diferentes', () => {
    const merged = mergeUniquePaths(
      ['src/A.cs', 'angular/x.ts'],
      ['src\\A.cs', 'angular/y.ts'],
    );
    assert.deepEqual(merged, ['src/A.cs', 'angular/x.ts', 'angular/y.ts']);
  });
});

describe('getUncommittedFileNames (seed install)', () => {
  it('inclui fixtures seed temporárias sem commit', (t) => {
    if (buildSeedTargets().length === 0) {
      t.skip('projeto não possui layout ABP (src/*Application + angular/src/app)');
      return;
    }
    installSeedFixtures(() => {});
    try {
      const repoRoot = getRepoRoot();
      const uncommitted = getUncommittedFileNames(repoRoot).map((p) => p.replace(/\\/g, '/'));

      assert.ok(
        uncommitted.some((p) => p.includes('CursorReviewerSeed/CursorReviewerSeedAppService.cs')),
        `backend seed ausente em: ${uncommitted.join(', ')}`,
      );
      assert.ok(
        uncommitted.some((p) => p.includes('cursor-reviewer-seed/cursor-reviewer-seed.component.ts')),
        `frontend ts seed ausente em: ${uncommitted.join(', ')}`,
      );
      assert.ok(
        uncommitted.some((p) => p.includes('cursor-reviewer-seed/cursor-reviewer-seed.component.html')),
        `frontend html seed ausente em: ${uncommitted.join(', ')}`,
      );

      const breakdown = getDiffBreakdown(
        repoRoot,
        'master...HEAD',
        ['**/*.cs', '**/*.ts', '**/*.html'],
        ['scripts/cursor-reviewer/**'],
        { includeUncommitted: true },
      );

      assert.ok(
        breakdown.filteredFiles.some((p) => p.replace(/\\/g, '/').includes('CursorReviewerSeedAppService.cs')),
        `breakdown elegível sem seed backend: ${breakdown.filteredFiles.join(', ')}`,
      );
    } finally {
      uninstallSeedFixtures();
    }
  });
});

describe('git diff filtering', () => {
  it('inclui arquivos renomeados e modificados no escopo elegível', () => {
    const repo = createTempGitRepo('rename');
    try {
      initRepo(repo);
      const original = Array.from({ length: 30 }, (_, i) => `public void M${i}() { }`).join('\n') + '\n';
      writeFileSync(resolve(repo, 'A.cs'), original);
      runGit(repo, ['add', 'A.cs']);
      runGit(repo, ['commit', '-q', '-m', 'base']);

      runGit(repo, ['checkout', '-q', '-b', 'feature']);
      runGit(repo, ['mv', 'A.cs', 'B.cs']);
      writeFileSync(
        resolve(repo, 'B.cs'),
        original.replace('public void M10() { }', 'public void M10() { System.Console.WriteLine(1); }'),
      );
      runGit(repo, ['add', 'B.cs']);
      runGit(repo, ['commit', '-q', '-m', 'rename and modify']);

      const nameStatus = runGit(repo, ['diff', '--name-status', 'master...HEAD']);
      assert.match(nameStatus, /^R\d+\s+A\.cs\s+B\.cs$/);

      const breakdown = getDiffBreakdown(repo, 'master...HEAD', ['**/*.cs', '*.cs'], []);
      assert.deepEqual(breakdown.filteredFiles, ['B.cs']);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('não inclui arquivos excluídos no patch verboso', () => {
    const repo = createTempGitRepo('secret');
    try {
      initRepo(repo);
      writeFileSync(resolve(repo, 'README.md'), 'base\n');
      runGit(repo, ['add', 'README.md']);
      runGit(repo, ['commit', '-q', '-m', 'base']);

      runGit(repo, ['checkout', '-q', '-b', 'feature']);
      writeFileSync(resolve(repo, 'secret.txt'), 'TOKEN=super-secret\n');
      writeFileSync(resolve(repo, 'Foo.cs'), 'class Foo {}\n');
      runGit(repo, ['add', '.']);
      runGit(repo, ['commit', '-q', '-m', 'feature']);

      const breakdown = getDiffBreakdown(repo, 'master...HEAD', ['**/*.cs', '*.cs'], ['secret.txt']);
      assert.deepEqual(breakdown.filteredFiles, ['Foo.cs']);

      const patch = getDiffPatch(repo, 'master...HEAD', { files: breakdown.filteredFiles });
      assert.match(patch, /Foo\.cs/);
      assert.ok(!patch.includes('TOKEN=super-secret'));
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('resume diff por arquivo em KB sem expor conteúdo do patch', () => {
    const repo = createTempGitRepo('summary');
    try {
      initRepo(repo);
      writeFileSync(resolve(repo, 'README.md'), 'base\n');
      runGit(repo, ['add', 'README.md']);
      runGit(repo, ['commit', '-q', '-m', 'base']);

      runGit(repo, ['checkout', '-q', '-b', 'feature']);
      writeFileSync(resolve(repo, 'Foo.cs'), 'class Foo { public void Bar() { } }\n');
      runGit(repo, ['add', 'Foo.cs']);
      runGit(repo, ['commit', '-q', '-m', 'feature']);

      const breakdown = getDiffBreakdown(repo, 'master...HEAD', ['**/*.cs', '*.cs'], []);
      const summaries = getDiffFileSummaries(repo, 'master...HEAD', { files: breakdown.filteredFiles });

      assert.deepEqual(
        summaries.map((item) => item.file),
        ['Foo.cs'],
      );
      assert.ok(summaries[0].sizeBytes > 0);
      assert.match(`${summaries[0].sizeBytes / 1024}`, /^\d+(\.\d+)?$/);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
