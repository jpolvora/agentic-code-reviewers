#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { resolveConsumerContext, toRepoRelative } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

function parseArgs(argv) {
  const options = { paths: [], minLines: 6, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') options.json = true;
    else if (token === '--path') options.paths.push(argv[++index]);
    else if (token === '--allowlist' || token === '--repo-root' || token === '--min-lines') {
      const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[key] = argv[++index];
    } else throw new Error(`unknown argument: ${token}`);
  }
  options.minLines = Number(options.minLines);
  if (!Number.isInteger(options.minLines) || options.minLines < 6) throw new Error('--min-lines must be at least 6');
  return options;
}

function shippedMarkdown(context) {
  const roots = ['AGENTS.md', 'CATALOG.md', 'README.md', 'FEATURES.md']
    .map((item) => path.join(context.repoRoot, item))
    .filter((item) => fs.existsSync(item));
  const skills = path.join(context.repoRoot, '.agents', 'skills');
  const stack = fs.existsSync(skills) ? [skills] : [];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      const relative = toRepoRelative(context.repoRoot, full);
      if (entry.isDirectory()) {
        if (!/^\.agents\/skills\/ws-shared\/memory(?:\/|$)/.test(relative)) stack.push(full);
      } else if (
        entry.name.endsWith('.md') &&
        !/^\.agents\/skills\/ws-shared\/(?:MEMORY|CHANGELOG|STACK|backend|frontend)\.md$/.test(relative)
      ) roots.push(full);
    }
  }
  return roots.map((item) => toRepoRelative(context.repoRoot, item)).sort();
}

function normativeBlocks(text, minLines) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let start = 0;
  while (start < lines.length) {
    while (start < lines.length && !lines[start].trim()) start += 1;
    let end = start;
    while (end < lines.length && lines[end].trim()) end += 1;
    const candidate = lines.slice(start, end);
    if (
      candidate.length >= minLines &&
      !candidate[0].startsWith('```') &&
      !candidate.every((line) => /^\s*\|/.test(line)) &&
      candidate.some((line) => /\b(?:must|never|required|forbidden|do not|always|shall)\b/i.test(line))
    ) {
      blocks.push({ startLine: start + 1, lines: candidate, text: candidate.join('\n') });
    }
    start = end + 1;
  }
  return blocks;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const files = options.paths.length ? options.paths : shippedMarkdown(context);
  const allowlist = options.allowlist
    ? JSON.parse(fs.readFileSync(path.resolve(context.repoRoot, options.allowlist), 'utf8')).blocks || []
    : [];
  const map = new Map();
  for (const relative of files) {
    const file = path.resolve(context.repoRoot, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    for (const block of normativeBlocks(fs.readFileSync(file, 'utf8'), options.minLines)) {
      const digest = crypto.createHash('sha256').update(block.text).digest('hex');
      const occurrence = { path: toRepoRelative(context.repoRoot, file), line: block.startLine };
      const row = map.get(digest) || { digest, lines: block.lines.length, text: block.text, occurrences: [] };
      row.occurrences.push(occurrence);
      map.set(digest, row);
    }
  }
  const duplicates = [...map.values()]
    .filter((row) => new Set(row.occurrences.map((item) => item.path)).size > 1)
    .filter((row) => !allowlist.some((item) => item.sha256 === row.digest))
    .map(({ text: _text, ...row }) => row)
    .sort((a, b) => a.digest.localeCompare(b.digest));
  const result = { ok: duplicates.length === 0, minLines: options.minLines, filesScanned: files.length, duplicates };
  process.stdout.write(options.json ? `${JSON.stringify(result, null, 2)}\n` : duplicates.map((row) => `${row.digest} (${row.lines} lines): ${row.occurrences.map((item) => `${item.path}:L${item.line}`).join(', ')}`).join('\n') + (duplicates.length ? '\n' : 'No duplicated normative blocks.\n'));
  process.exitCode = result.ok ? 0 : 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
