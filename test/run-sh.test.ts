import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before, after } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const runSh = './run.sh';

function runShArgs(args: string[], options?: { expectFailure?: boolean }): string {
  try {
    return execFileSync('bash', [runSh, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (!options?.expectFailure) throw error;
    const execError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; status?: number };
    return `${execError.stdout ?? ''}${execError.stderr ?? ''}`;
  }
}

describe('run.sh', () => {
  it('--help documenta --local e modo remoto', () => {
    const output = runShArgs(['--help']);
    assert.match(output, /--local/);
    assert.match(output, /review-remote\.yml/);
    assert.match(output, /AGENTIC_CODE_REVIEWERS_RELEASE_BRANCH/);
  });

  it('rejeita engine inválida', () => {
    const output = runShArgs(['--engine', 'invalid-engine'], { expectFailure: true });
    assert.match(output, /Engine inválida/i);
  });

  it('normaliza cursor para cursor-sdk via env', () => {
    const output = execFileSync(
      'bash',
      ['-c', `AGENTIC_CODE_REVIEWERS_LOCAL=1 CURSOR_API_KEY=test bash "${runSh}" --engine cursor --help`],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.match(output, /--local/);
  });

  describe('prepare_opencode', () => {
    let tempDir: string;
    let mockBinDir: string;
    let mockHome: string;

    function toWslPath(winPath: string): string {
      try {
        const winPathSafe = winPath.replace(/\\/g, '/');
        return execFileSync('wsl', ['wslpath', '-u', winPathSafe], { encoding: 'utf8' }).trim();
      } catch {
        const drive = winPath.match(/^([a-zA-Z]):/);
        if (drive) {
          return `/${drive[1].toLowerCase()}${winPath.slice(2).replace(/\\/g, '/')}`;
        }
        return winPath.replace(/\\/g, '/');
      }
    }

    before(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-test-'));
      mockBinDir = path.join(tempDir, 'bin');
      mockHome = path.join(tempDir, 'home');
      fs.mkdirSync(mockBinDir, { recursive: true });
      fs.mkdirSync(mockHome, { recursive: true });

      // Write mock opencode binary
      const opencodePath = path.join(mockBinDir, 'opencode');
      fs.writeFileSync(opencodePath, '#!/bin/sh\nexit 0\n');
      fs.chmodSync(opencodePath, 0o755);

      // Write mock npx binary
      const npxPath = path.join(mockBinDir, 'npx');
      fs.writeFileSync(npxPath, '#!/bin/sh\nexit 0\n');
      fs.chmodSync(npxPath, 0o755);

      // Write mock node wrapper if on Windows to delegate to node.exe inside WSL
      if (process.platform === 'win32') {
        const nodePath = path.join(mockBinDir, 'node');
        fs.writeFileSync(nodePath, '#!/bin/sh\nnode.exe "$@"\n');
        fs.chmodSync(nodePath, 0o755);
      }
    });

    after(() => {
      if (tempDir && fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    });

    it('trims OPENCODE_API_KEY with surrounding spaces and writes it to auth.json', () => {
      const mockBinDirSafe = mockBinDir.replace(/\\/g, '/');
      const mockHomeUnix = toWslPath(mockHome);
      const originalPath = process.env.PATH || '';

      const customEnv = {
        PATH: `${mockBinDirSafe}${path.delimiter}${originalPath}`,
        AGENTIC_CODE_REVIEWERS_LOCAL: 'true',
        AGENTIC_CODE_REVIEWERS_ENGINE: 'opencode',
        OPENCODE_API_KEY: '  my-clean-key  ',
        WSLENV: 'AGENTIC_CODE_REVIEWERS_LOCAL/u:AGENTIC_CODE_REVIEWERS_ENGINE/u:OPENCODE_API_KEY/u:OPENCODE_API_KEY/w:HOME/p',
      };

      const authJsonPath = path.join(mockHome, '.local/share/opencode/auth.json');
      if (fs.existsSync(authJsonPath)) {
        fs.unlinkSync(authJsonPath);
      }

      execFileSync('bash', ['-c', `HOME="${mockHomeUnix}" bash "${runSh}"`], {
        cwd: repoRoot,
        env: { ...process.env, ...customEnv },
        encoding: 'utf8',
      });

      assert.strictEqual(fs.existsSync(authJsonPath), true);
      const authData = JSON.parse(fs.readFileSync(authJsonPath, 'utf8'));
      assert.strictEqual(authData['opencode-go'].key, 'my-clean-key');
    });

    it('does not write or overwrite auth.json if OPENCODE_API_KEY is whitespace-only', () => {
      const mockBinDirSafe = mockBinDir.replace(/\\/g, '/');
      const mockHomeUnix = toWslPath(mockHome);
      const originalPath = process.env.PATH || '';

      const customEnv = {
        PATH: `${mockBinDirSafe}${path.delimiter}${originalPath}`,
        AGENTIC_CODE_REVIEWERS_LOCAL: 'true',
        AGENTIC_CODE_REVIEWERS_ENGINE: 'opencode',
        OPENCODE_API_KEY: '    ',
        WSLENV: 'AGENTIC_CODE_REVIEWERS_LOCAL/u:AGENTIC_CODE_REVIEWERS_ENGINE/u:OPENCODE_API_KEY/u:OPENCODE_API_KEY/w:HOME/p',
      };

      const authJsonPath = path.join(mockHome, '.local/share/opencode/auth.json');

      // Ensure file exists with some pre-existing content
      fs.mkdirSync(path.dirname(authJsonPath), { recursive: true });
      fs.writeFileSync(authJsonPath, JSON.stringify({ existing: true }));

      execFileSync('bash', ['-c', `HOME="${mockHomeUnix}" bash "${runSh}"`], {
        cwd: repoRoot,
        env: { ...process.env, ...customEnv },
        encoding: 'utf8',
      });

      // Assert it was NOT overwritten/deleted, and still has the old content
      assert.strictEqual(fs.existsSync(authJsonPath), true);
      const authData = JSON.parse(fs.readFileSync(authJsonPath, 'utf8'));
      assert.strictEqual(authData.existing, true);
      assert.strictEqual(authData['opencode-go'], undefined);
    });
  });
});
