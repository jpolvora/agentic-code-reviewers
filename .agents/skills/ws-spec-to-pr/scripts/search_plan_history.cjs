#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveConsumerContext, resolveConfiguredPath, toRepoRelative } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

function parseArgs(argv) {
  const options = { keyword: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unknown argument: ${token}`);
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = argv[++index];
    if (key === 'keyword') options.keyword.push(value);
    else options[key] = value;
  }
  if (!options.slug && !options.keyword.length) throw new Error('--slug or --keyword is required');
  return options;
}

function tokens(options) {
  return [...new Set([options.slug, ...options.keyword]
    .filter(Boolean)
    .flatMap((value) => String(value).toLowerCase().split(/[^a-z0-9]+/))
    .filter((value) => value.length >= 3))];
}

function candidateFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => /^step-(?:00|01|02|05|08)-.*\.(?:md|json)$/.test(name) || name === 'RUN.md' || name === 'run.json')
    .sort()
    .map((name) => path.join(directory, name));
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const plansDir = resolveConfiguredPath(context.repoRoot, context.config?.plans?.dir || '.agents/plans');
  const indexFile = path.join(plansDir, 'index.json');
  const index = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { workflows: [] };
  const needles = tokens(options);
  const matches = [];
  for (const workflow of index.workflows || []) {
    if (workflow.status !== 'completed') continue;
    const stateFile = path.resolve(context.repoRoot, workflow.statePath);
    const directory = path.dirname(stateFile);
    let best = 0;
    const artifacts = [];
    for (const file of candidateFiles(directory)) {
      const relative = toRepoRelative(context.repoRoot, file);
      const haystack = `${relative}\n${fs.readFileSync(file, 'utf8')}`.toLowerCase();
      const score = needles.filter((needle) => haystack.includes(needle)).length;
      if (score > 0) {
        best = Math.max(best, score);
        artifacts.push(relative);
      }
    }
    const slugMatch = options.slug && String(workflow.slug || '').toLowerCase() === String(options.slug).toLowerCase();
    if (slugMatch || best > 0) {
      matches.push({
        workflowId: workflow.workflowId,
        slug: workflow.slug,
        score: slugMatch ? needles.length + 1 : best,
        artifacts: [...new Set(artifacts)].sort(),
      });
    }
  }
  matches.sort((a, b) => b.score - a.score || a.workflowId.localeCompare(b.workflowId));
  const result = {
    indexPath: fs.existsSync(indexFile) ? toRepoRelative(context.repoRoot, indexFile) : null,
    keywords: needles,
    matches,
  };
  if (options.output) {
    const output = path.resolve(context.repoRoot, options.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    result.output = toRepoRelative(context.repoRoot, output);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
