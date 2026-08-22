#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  resolveConsumerContext,
  resolveConfiguredPath,
  toRepoRelative,
} = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

function parseArgs(argv) {
  const args = { json: false, ensure: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--detect' || token === '--validate' || token === '--ensure' || token === '--json') args[token.slice(2)] = true;
    else if (token === '--configure' || token === '--repo-root') args[token.slice(2).replace('-r', 'R')] = argv[++i];
    else throw new Error(`unknown argument: ${token}`);
  }
  if (![args.detect, args.validate, Boolean(args.configure)].filter(Boolean).length) throw new Error('choose --detect, --configure, or --validate');
  return args;
}

function save(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function emit(payload, json) {
  process.stdout.write(json ? `${JSON.stringify(payload, null, 2)}\n` : Object.entries(payload).map(([key, value]) => `${key}: ${value}`).join('\n') + '\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: args.repoRoot, scriptFile: __filename });
  const configFile = path.join(context.sharedDir, 'config.json');
  const config = fs.existsSync(configFile) ? JSON.parse(fs.readFileSync(configFile, 'utf8')) : {};
  const fallback = fs.existsSync(path.join(context.repoRoot, 'specs')) ? 'specs' : '.agents/specs';
  let configured = args.configure || config.plans?.specsDir || fallback;
  let specsDir = resolveConfiguredPath(context.repoRoot, configured, fallback);
  let wroteConfig = false;
  let createdDir = false;

  if (args.configure || args.ensure || args.validate) {
    if (!fs.existsSync(specsDir)) {
      fs.mkdirSync(specsDir, { recursive: true });
      createdDir = true;
    }
    if (!fs.statSync(specsDir).isDirectory()) throw new Error(`specsDir is not a directory: ${specsDir}`);
  }
  if ((args.configure || args.ensure) && !config.plans?.specsDir) {
    config.$schema ||= './config.schema.json';
    config.plans ||= {};
    config.plans.specsDir = toRepoRelative(context.repoRoot, specsDir, { allowOutside: true });
    save(configFile, config);
    wroteConfig = true;
  } else if (args.configure) {
    config.plans ||= {};
    config.plans.specsDir = toRepoRelative(context.repoRoot, specsDir, { allowOutside: true });
    save(configFile, config);
    wroteConfig = true;
  }

  const payload = {
    ok: true,
    specsDir: toRepoRelative(context.repoRoot, specsDir, { allowOutside: true }),
    exists: fs.existsSync(specsDir),
    createdDir,
    wroteConfig,
    configPath: toRepoRelative(context.repoRoot, configFile, { allowOutside: true }),
  };
  emit(payload, args.json);
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
