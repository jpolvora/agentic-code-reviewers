#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { resolveConsumerContext, toRepoRelative } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

const MARKERS = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'global.json',
  'docker-compose.yml',
  'compose.yml',
];

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) positional.push(argv[index]);
    else options[argv[index].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++index];
  }
  return { command: positional[0] || 'check', options };
}

function fingerprint(repoRoot) {
  const hash = crypto.createHash('sha256');
  const files = [];
  for (const marker of MARKERS) {
    const file = path.join(repoRoot, marker);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const content = fs.readFileSync(file);
    hash.update(`${marker}\0${content.length}\0`);
    hash.update(content);
    files.push(marker);
  }
  return { value: hash.digest('hex'), files };
}

function frontmatter(text) {
  const match = text.replace(/\r\n?/g, '\n').match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: text.replace(/\r\n?/g, '\n') };
  const data = {};
  for (const line of match[1].split('\n')) {
    const split = line.indexOf(':');
    if (split > 0) data[line.slice(0, split).trim()] = line.slice(split + 1).trim();
  }
  return { data, body: text.replace(/\r\n?/g, '\n').slice(match[0].length) };
}

function write(file, data, body) {
  const content = `---\n${Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n${body.replace(/^\n*/, '\n')}`;
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content, 'utf8');
  fs.renameSync(temporary, file);
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (!['check', 'write'].includes(command)) throw new Error('command must be check or write');
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const configured = context.config?.rules?.stackFile || '.agents/skills/ws-shared/STACK.md';
  const stackFile = path.resolve(context.repoRoot, options.stackFile || configured);
  const current = fingerprint(context.repoRoot);
  const parsed = fs.existsSync(stackFile) ? frontmatter(fs.readFileSync(stackFile, 'utf8')) : { data: {}, body: '# Stack\n' };
  const matches = parsed.data.stackFingerprint === current.value;
  if (command === 'write') {
    fs.mkdirSync(path.dirname(stackFile), { recursive: true });
    write(stackFile, { ...parsed.data, stackFingerprint: current.value, stackFingerprintVersion: 1 }, parsed.body);
  }
  process.stdout.write(`${JSON.stringify({
    command,
    stackPath: toRepoRelative(context.repoRoot, stackFile),
    fingerprint: current.value,
    markerFiles: current.files,
    matches,
    skipDetection: command === 'check' && matches,
  }, null, 2)}\n`);
  if (command === 'check' && !matches) process.exitCode = 2;
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
