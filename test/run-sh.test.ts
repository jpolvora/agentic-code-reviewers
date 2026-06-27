import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const runSh = path.join(repoRoot, 'run.sh');

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
      ['-c', `AGENTIC_CODE_REVIEWERS_LOCAL=1 AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY=test bash "${runSh}" --engine cursor --help`],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    assert.match(output, /--local/);
  });
});
