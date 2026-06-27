import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { resolveAutoFixBuildCommand, runAutoFixBuild } from '../src/git/autofix-build.js';

describe('resolveAutoFixBuildCommand', () => {
  it('usa env quando definido', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-build-'));
    assert.equal(resolveAutoFixBuildCommand(tmpDir, 'dotnet build'), 'dotnet build');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retorna null quando env é string vazia (desabilitado)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-build-'));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { build: 'tsc' } }),
    );
    assert.equal(resolveAutoFixBuildCommand(tmpDir, ''), null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detecta npm run build quando package.json tem scripts.build', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-build-'));
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ scripts: { build: 'tsc' } }),
    );
    assert.equal(resolveAutoFixBuildCommand(tmpDir), 'npm run build');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('retorna null sem package.json ou sem script build', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-build-'));
    assert.equal(resolveAutoFixBuildCommand(tmpDir), null);
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }));
    assert.equal(resolveAutoFixBuildCommand(tmpDir), null);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe('runAutoFixBuild', () => {
  const logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    section: () => {},
  } as any;

  it('retorna true quando não há comando de build', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-build-run-'));
    try {
      const ok = await runAutoFixBuild(
        { repoRoot: tmpDir, dryRun: false, autoFixBuildCommand: null } as any,
        logger,
      );
      assert.equal(ok, true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('retorna false quando o comando falha', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autofix-build-run-'));
    try {
      const ok = await runAutoFixBuild(
        {
          repoRoot: tmpDir,
          dryRun: false,
          autoFixBuildCommand: process.platform === 'win32' ? 'cmd /c exit 1' : 'false',
        } as any,
        logger,
      );
      assert.equal(ok, false);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
