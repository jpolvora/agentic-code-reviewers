import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { buildDiffPromptSection } from '../src/git/diff-prompt.js';
import { getDiffBreakdown } from '../src/git/diff.js';

function createTempGitRepo(prefix: string): string {
  const baseDir = join(
    tmpdir(),
    `cursor-reviewer-diff-prompt-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
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

describe('buildDiffPromptSection', () => {
  it('injeta unified diff completo para PR pequena', () => {
    const repo = createTempGitRepo('small');
    try {
      initRepo(repo);
      writeFileSync(resolve(repo, 'README.md'), 'base\n');
      runGit(repo, ['add', 'README.md']);
      runGit(repo, ['commit', '-q', '-m', 'base']);

      runGit(repo, ['checkout', '-q', '-b', 'feature']);
      writeFileSync(resolve(repo, 'Foo.cs'), 'class Foo { public void Bar() { } }\n');
      runGit(repo, ['add', 'Foo.cs']);
      runGit(repo, ['commit', '-q', '-m', 'feature']);

      const breakdown = getDiffBreakdown(repo, 'master...HEAD', ['**/*.cs'], []);
      const section = buildDiffPromptSection(repo, 'master...HEAD', breakdown.filteredFiles);

      assert.equal(section.mode, 'full');
      assert.ok(section.content.includes('```diff'));
      assert.ok(section.content.includes('Bar'));
      assert.ok(section.totalBytes > 0);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it('usa modo per-file quando diff excede o teto', () => {
    const repo = createTempGitRepo('large');
    try {
      initRepo(repo);
      writeFileSync(resolve(repo, 'README.md'), 'base\n');
      runGit(repo, ['add', 'README.md']);
      runGit(repo, ['commit', '-q', '-m', 'base']);

      runGit(repo, ['checkout', '-q', '-b', 'feature']);
      const payload = 'x'.repeat(8_000);
      writeFileSync(resolve(repo, 'Big.cs'), `class Big { const string S = "${payload}"; }\n`);
      runGit(repo, ['add', 'Big.cs']);
      runGit(repo, ['commit', '-q', '-m', 'feature']);

      const breakdown = getDiffBreakdown(repo, 'master...HEAD', ['**/*.cs'], []);
      const section = buildDiffPromptSection(repo, 'master...HEAD', breakdown.filteredFiles, {}, 2_000);

      assert.equal(section.mode, 'per-file');
      assert.ok(section.content.includes('### Big.cs'));
      assert.ok(section.includedFiles >= 1);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
