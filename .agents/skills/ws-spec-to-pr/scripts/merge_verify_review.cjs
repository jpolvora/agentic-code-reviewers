#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveConsumerContext, toRepoRelative } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

const SEVERITY = { Critical: 0, Warning: 1, Suggestion: 2 };

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unknown argument: ${token}`);
    options[token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++index];
  }
  for (const key of ['verify', 'review', 'output']) if (!options[key]) throw new Error(`--${key} is required`);
  return options;
}

function readPayload(file, label) {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a JSON object`);
  if (!Array.isArray(value.findings)) throw new Error(`${label}.findings must be an array`);
  return value;
}

function finding(value, source) {
  if (!/^.+$/.test(value.id || '') || !Object.hasOwn(SEVERITY, value.severity)) throw new Error(`${source}: finding requires stable id and severity`);
  if (!value.path || !Number.isInteger(Number(value.line))) throw new Error(`${source}: finding requires path and line`);
  return {
    ...value,
    source,
    path: String(value.path).replace(/\\/g, '/'),
    line: Number(value.line),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const verify = readPayload(path.resolve(context.repoRoot, options.verify), 'verify');
  const review = readPayload(path.resolve(context.repoRoot, options.review), 'review');
  const seen = new Set();
  const findings = [
    ...verify.findings.map((item) => finding(item, 'verify')),
    ...review.findings.map((item) => finding(item, 'review')),
  ].filter((item) => {
    const key = `${item.id}\0${item.source}`;
    if (seen.has(key)) throw new Error(`duplicate finding identity: ${item.source}/${item.id}`);
    seen.add(key);
    return true;
  }).sort((a, b) => SEVERITY[a.severity] - SEVERITY[b.severity]
    || a.path.localeCompare(b.path)
    || a.line - b.line
    || a.id.localeCompare(b.id)
    || a.source.localeCompare(b.source));
  const result = {
    schemaVersion: 1,
    score: Number(verify.score),
    findings,
    requiresFix: Number(verify.score) < 9 || findings.some((item) => ['Critical', 'Warning'].includes(item.severity)),
  };
  const output = path.resolve(context.repoRoot, options.output);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ...result, output: toRepoRelative(context.repoRoot, output) }, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
