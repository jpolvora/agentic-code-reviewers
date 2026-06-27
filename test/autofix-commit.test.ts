import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { buildAutoFixCommitMessage, isLocalAheadOfRemote } from '../src/git/autofix-commit.js';
import type { ReviewerConfig } from '../src/config.js';

describe('buildAutoFixCommitMessage', () => {
  it('inclui número da PR quando disponível', () => {
    const msg = buildAutoFixCommitMessage({ pullRequestId: 42 } as ReviewerConfig);
    assert.match(msg, /PR #42/);
    assert.match(msg, /^fix\(review\):/);
  });

  it('usa mensagem genérica sem PR id', () => {
    const msg = buildAutoFixCommitMessage({ pullRequestId: 0 } as ReviewerConfig);
    assert.equal(msg, 'fix(review): apply auto-fixes for active review threads');
  });
});

describe('isLocalAheadOfRemote', () => {
  it('retorna true quando há commit local não enviado', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-ahead-'));
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-remote-'));
    try {
      execSync('git init -b master', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git init --bare', { cwd: remoteDir, stdio: 'ignore' });
      execSync(`git remote add origin "${remoteDir}"`, { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "test"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'a');
      execSync('git add f.txt && git commit -m "initial" && git push -u origin master', {
        cwd: tmpDir,
        stdio: 'ignore',
      });
      fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'b');
      execSync('git add f.txt && git commit -m "local only"', { cwd: tmpDir, stdio: 'ignore' });
      assert.equal(isLocalAheadOfRemote(tmpDir), true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(remoteDir, { recursive: true, force: true });
    }
  });

  it('retorna false quando local e remoto estão alinhados', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-sync-'));
    const remoteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-remote-'));
    try {
      execSync('git init -b master', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git init --bare', { cwd: remoteDir, stdio: 'ignore' });
      execSync(`git remote add origin "${remoteDir}"`, { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.name "test"', { cwd: tmpDir, stdio: 'ignore' });
      execSync('git config user.email "test@example.com"', { cwd: tmpDir, stdio: 'ignore' });
      fs.writeFileSync(path.join(tmpDir, 'f.txt'), 'a');
      execSync('git add f.txt && git commit -m "initial" && git push -u origin master', {
        cwd: tmpDir,
        stdio: 'ignore',
      });
      assert.equal(isLocalAheadOfRemote(tmpDir), false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      fs.rmSync(remoteDir, { recursive: true, force: true });
    }
  });
});
