import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { ReviewerConfig } from '../config.js';
import type { PromptContext } from '../agent/prompt.js';
import { getDiffPatch } from '../git/diff.js';
import { parseChangedLinesFromDiff } from '../git/diff-lines.js';
import { runGit } from '../git/diff.js';

export interface ReviewToolContext {
  repoRoot: string;
  diffRange: string;
  diffText: string;
  changedFiles: string[];
}

export interface ReviewToolResult {
  content: string;
  isError?: boolean;
}

const DEFAULT_GREP_MAX = 200;

function assertInsideRepo(repoRoot: string, targetPath: string): string {
  const abs = resolve(repoRoot, targetPath);
  const rel = relative(resolve(repoRoot), abs);
  if (rel.startsWith('..')) {
    throw new Error(`Path outside repo: ${targetPath}`);
  }
  return abs;
}

export function createReviewToolContext(config: ReviewerConfig, context: PromptContext): ReviewToolContext {
  const diffText = getDiffPatch(config.repoRoot, context.gitContext.diffRange, {
    includeUncommitted: context.gitContext.includeUncommitted,
    files: context.diffStats.files,
  });
  return {
    repoRoot: config.repoRoot,
    diffRange: context.gitContext.diffRange,
    diffText,
    changedFiles: context.diffStats.files,
  };
}

export function toolGetDiff(ctx: ReviewToolContext, file?: string): ReviewToolResult {
  if (file) {
    try {
      const patch = runGit(ctx.repoRoot, ['diff', ctx.diffRange, '--', file]);
      return { content: patch || '(empty diff for file)' };
    } catch (error) {
      return { content: String(error), isError: true };
    }
  }
  return { content: ctx.diffText || '(empty diff)' };
}

export function toolGetChangedFiles(ctx: ReviewToolContext): ReviewToolResult {
  const map = parseChangedLinesFromDiff(ctx.diffText);
  const lines: string[] = [];
  for (const [file, lineSet] of map) {
    const sorted = [...lineSet].sort((a, b) => a - b);
    lines.push(`${file}: ${sorted.join(', ')}`);
  }
  if (ctx.changedFiles.length > 0) {
    lines.push('', 'Eligible files:', ctx.changedFiles.join(', '));
  }
  return { content: lines.join('\n') };
}

export function toolReadFile(ctx: ReviewToolContext, filePath: string, maxBytes = 50_000): ReviewToolResult {
  try {
    const abs = assertInsideRepo(ctx.repoRoot, filePath);
    if (!existsSync(abs)) {
      return { content: `File not found: ${filePath}`, isError: true };
    }
    const buf = readFileSync(abs);
    if (buf.byteLength > maxBytes) {
      return {
        content: buf.subarray(0, maxBytes).toString('utf8') + `\n\n[... truncated at ${maxBytes} bytes ...]`,
      };
    }
    return { content: buf.toString('utf8') };
  } catch (error) {
    return { content: String(error), isError: true };
  }
}

export function toolGrep(
  ctx: ReviewToolContext,
  pattern: string,
  glob?: string,
  maxResults = DEFAULT_GREP_MAX,
): ReviewToolResult {
  try {
    const args = ['grep', '-n', '-E', pattern, '--'];
    if (glob) {
      args.push(glob);
    } else {
      args.push('.');
    }
    const output = execFileSync('git', args, {
      cwd: ctx.repoRoot,
      encoding: 'utf8',
      timeout: 120_000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const lines = output.split(/\r?\n/).filter(Boolean);
    if (lines.length > maxResults) {
      return {
        content: lines.slice(0, maxResults).join('\n') + `\n\n[... ${lines.length - maxResults} more matches truncated ...]`,
      };
    }
    return { content: lines.join('\n') || '(no matches)' };
  } catch (error: unknown) {
    const err = error as { status?: number; stdout?: string };
    if (err.status === 1) {
      return { content: '(no matches)' };
    }
    return { content: String(error), isError: true };
  }
}

export function toolRunCommand(ctx: ReviewToolContext, command: string, label: string): ReviewToolResult {
  if (!command.trim()) {
    return { content: `${label} not configured`, isError: true };
  }
  try {
    const output = execFileSync(command, {
      cwd: ctx.repoRoot,
      encoding: 'utf8',
      shell: true,
      maxBuffer: 512 * 1024,
      timeout: 120_000,
    });
    return { content: output || `(${label} completed with no output)` };
  } catch (error: unknown) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const parts = [err.stdout, err.stderr, err.message].filter(Boolean);
    return { content: parts.join('\n') || String(error), isError: true };
  }
}

export const REVIEW_TOOL_NAMES = [
  'get_diff',
  'get_changed_files',
  'read_file',
  'grep',
  'run_lint',
  'run_tests',
] as const;

export type ReviewToolName = (typeof REVIEW_TOOL_NAMES)[number];

export function isToolAllowed(name: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) {
    return REVIEW_TOOL_NAMES.includes(name as ReviewToolName);
  }
  return allowlist.includes(name);
}

export function executeReviewTool(
  name: ReviewToolName,
  ctx: ReviewToolContext,
  config: ReviewerConfig,
  args: Record<string, string> = {},
): ReviewToolResult {
  switch (name) {
    case 'get_diff':
      return toolGetDiff(ctx, args.file);
    case 'get_changed_files':
      return toolGetChangedFiles(ctx);
    case 'read_file':
      return toolReadFile(ctx, args.path ?? args.file ?? '');
    case 'grep':
      return toolGrep(ctx, args.pattern ?? '', args.glob);
    case 'run_lint':
      return toolRunCommand(ctx, config.mcpLintCmd, 'run_lint');
    case 'run_tests':
      return toolRunCommand(ctx, config.mcpTestCmd, 'run_tests');
    default:
      return { content: `Unknown tool: ${name}`, isError: true };
  }
}
