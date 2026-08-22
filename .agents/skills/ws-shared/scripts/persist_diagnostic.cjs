#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveConsumerContext, toRepoRelative } = require('./resolve_consumer_root.cjs');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unknown argument: ${token}`);
    options[token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++index];
  }
  if (!['doctor', 'harness'].includes(options.kind)) throw new Error('--kind must be doctor or harness');
  if (!options.input) throw new Error('--input is required');
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const input = path.resolve(context.repoRoot, options.input);
  const configured = options.outputDir || context.config?.plans?.diagnosticsDir || '.agents/plans/diagnostics';
  const directory = path.resolve(context.repoRoot, configured);
  const timestamp = new Date().toISOString();
  const extension = path.extname(input) || '.md';
  const output = path.join(directory, `${options.kind}-${timestamp.replace(/[:.]/g, '-')}${extension}`);
  fs.mkdirSync(directory, { recursive: true });
  fs.copyFileSync(input, output, fs.constants.COPYFILE_EXCL);
  process.stdout.write(`${JSON.stringify({
    kind: options.kind,
    generatedAt: timestamp,
    source: toRepoRelative(context.repoRoot, input),
    output: toRepoRelative(context.repoRoot, output),
  }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
