#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveConsumerContext, toRepoRelative } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--repo-root') args.repoRoot = argv[++index];
    else if (argv[index] === '--json') args.json = true;
    else throw new Error(`unknown argument: ${argv[index]}`);
  }
  return args;
}

function matcher(glob) {
  const normalized = glob.replace(/\\/g, '/');
  let pattern = '';
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === '*' && normalized[index + 1] === '*' && normalized[index + 2] === '/') {
      pattern += '(?:.*/)?';
      index += 2;
    } else if (character === '*' && normalized[index + 1] === '*') {
      pattern += '.*';
      index += 1;
    } else if (character === '*') pattern += '[^/]*';
    else if (character === '?') pattern += '[^/]';
    else pattern += character.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${pattern}$`);
}

function walk(root) {
  const files = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['.git', 'node_modules'].includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else files.push(full);
    }
  }
  return files;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: args.repoRoot, scriptFile: __filename });
  const aliases = Object.entries(context.config?.verification || {})
    .filter(([key, value]) => /Test$/.test(key) && typeof value === 'string' && value.trim())
    .map(([key, command]) => ({ key, command }));
  const globs = context.config?.defaults?.testGlobs || [
    'test/**/*.js',
    'tests/**/*',
    '**/*.test.*',
    '**/*.spec.*',
  ];
  const expressions = globs.map(matcher);
  const matches = walk(context.repoRoot)
    .map((file) => toRepoRelative(context.repoRoot, file))
    .filter((file) => expressions.some((expression) => expression.test(file)))
    .sort();
  const payload = {
    schemaVersion: 1,
    hasTestSurface: aliases.length > 0 || matches.length > 0,
    aliases,
    globs,
    matches,
    skipReason: aliases.length === 0 && matches.length === 0 ? 'no-test-surface' : null,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
