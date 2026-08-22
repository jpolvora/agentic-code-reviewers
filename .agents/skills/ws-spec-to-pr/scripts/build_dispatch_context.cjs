#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { resolveConsumerContext, resolveConfiguredPath, toRepoRelative } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

const FIXED_LIMIT = 18000;
const MEMORY_LIMIT = 4000;
const DEFAULT_LIMIT = 32000;
const ENHANCING_SKILLS = [
  'ws-karpathy-guidelines',
  'ws-senior-developer',
  'ws-tdah',
  'ws-self-learning',
  'ws-patterns-frontend',
  'ws-patterns-backend',
];

function parseArgs(argv) {
  const options = { ac: [], paths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (!token.startsWith('--')) throw new Error(`unknown argument: ${token}`);
    if (key === 'ac' || key === 'path') options[key === 'path' ? 'paths' : key].push(argv[++index]);
    else options[key] = argv[++index];
  }
  if (!options.skill) throw new Error('--skill is required');
  return options;
}

function section(text, heading) {
  const normalized = text.replace(/\r\n?/g, '\n');
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = normalized.match(new RegExp(`^(#{2,4})\\s+${escaped}\\s*$\\n([\\s\\S]*?)(?=^\\1\\s+|\\z)`, 'mi'));
  if (match) return `${match[1]} ${heading}\n${match[2].replace(/\s*$/, '\n')}`;
  const start = normalized.search(new RegExp(`^#{2,4}\\s+${escaped}\\s*$`, 'mi'));
  if (start < 0) throw new Error(`required section not found: ${heading}`);
  const tail = normalized.slice(start);
  const level = tail.match(/^(#{2,4})/)?.[1].length || 2;
  const next = tail.slice(1).search(new RegExp(`^#{1,${level}}\\s+`, 'm'));
  return (next < 0 ? tail : tail.slice(0, next + 1)).replace(/\s*$/, '\n');
}

function bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function indexedSlices(context, indexFile, acIds) {
  if (!indexFile || !acIds.length) return '';
  const index = JSON.parse(fs.readFileSync(path.resolve(context.repoRoot, indexFile), 'utf8'));
  const source = fs.readFileSync(path.resolve(context.repoRoot, index.source.path));
  const sourceHash = crypto.createHash('sha256').update(source).digest('hex');
  if (sourceHash !== index.source.sha256) throw new Error('plan index source hash mismatch');
  const sectionIds = [...new Set(acIds.flatMap((id) => index.acceptanceCriteria.find((row) => row.id === id)?.planSectionIds || []))];
  return sectionIds.map((id) => {
    const item = index.sections.find((row) => row.id === id);
    if (!item) throw new Error(`plan index section missing: ${id}`);
    const slice = source.subarray(item.byteStart, item.byteEnd);
    const sliceHash = crypto.createHash('sha256').update(slice).digest('hex');
    if (sliceHash !== item.sha256) throw new Error(`plan section hash mismatch: ${id}`);
    return slice.toString('utf8');
  }).join('');
}

function memorySlice(context, paths) {
  if (!paths.length) return '';
  const memory = path.join(context.sharedDir, 'MEMORY.md');
  if (!fs.existsSync(memory)) return '';
  const entries = fs.readFileSync(memory, 'utf8').replace(/\r\n?/g, '\n').split(/(?=^### \[)/m);
  const normalized = paths.map((item) => item.replace(/\\/g, '/').toLowerCase());
  const matching = entries.filter((entry) => normalized.some((item) => entry.toLowerCase().includes(item) || entry.toLowerCase().includes(path.basename(item))));
  let output = matching.join('').trim();
  while (bytes(output) > MEMORY_LIMIT && output.includes('\n')) output = output.slice(0, output.lastIndexOf('\n'));
  if (bytes(output) > MEMORY_LIMIT) output = '';
  return output ? `${output}\n` : '';
}

function optionalFile(context, file) {
  if (!file) return '';
  const absolute = path.resolve(context.repoRoot, file);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8').replace(/\r\n?/g, '\n') : '';
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const skillPath = path.resolve(context.repoRoot, options.skill);
  const targetText = fs.readFileSync(skillPath, 'utf8');
  const header = [
    '# Portable workflow dispatch',
    '',
    'Follow the target skill contract, the injected acceptance-criteria slices, and every hard stop below.',
    'Write only the paths assigned to this dispatch. Return structured step-output evidence.',
    '',
  ].join('\n');
  const contracts = ENHANCING_SKILLS.map((skill) => {
    const file = path.join(context.skillsRoot, skill, 'SKILL.md');
    const contract = section(fs.readFileSync(file, 'utf8'), 'Subagent contract');
    if (contract.split('\n').length - 1 > 40) throw new Error(`${skill} Subagent contract exceeds 40 lines`);
    return contract;
  }).join('\n');
  const fixed = `${header}${contracts}`;
  if (bytes(fixed) > FIXED_LIMIT) throw new Error(`fixed dispatch preamble exceeds ${FIXED_LIMIT} bytes`);

  const targetSections = (options.sections || 'Subagent contract').split(',').map((name) => section(targetText, name.trim())).join('\n');
  const plan = indexedSlices(context, options.planIndex, options.ac);
  const state = options.state ? section(optionalFile(context, options.state), 'Step outputs (compact)') : '';
  const memory = memorySlice(context, options.paths);
  const stack = optionalFile(context, options.stack);
  const history = optionalFile(context, options.history);
  const mandatory = `${fixed}\n${targetSections}\n${plan}\n${state}`;
  const configured = Number(context.config?.defaults?.contextBudget || DEFAULT_LIMIT);
  if (!Number.isInteger(configured) || configured < FIXED_LIMIT) throw new Error('defaults.contextBudget must be an integer at least 18000');
  if (bytes(mandatory) > configured) throw new Error(`mandatory dispatch context exceeds configured ${configured}-byte budget`);

  const included = [];
  const omitted = [];
  let output = mandatory;
  for (const [name, content] of [['memory', memory], ['stack', stack], ['history', history]]) {
    if (!content) continue;
    if (bytes(output + content) <= configured) {
      output += `\n${content}`;
      included.push({ name, bytes: bytes(content) });
    } else omitted.push({ name, bytes: bytes(content), reason: 'context-budget' });
  }
  const manifest = {
    schemaVersion: 1,
    budgetBytes: configured,
    fixedPreambleBytes: bytes(fixed),
    mandatoryBytes: bytes(mandatory),
    totalBytes: bytes(output),
    included,
    omitted,
    memoryBytes: bytes(memory),
    acRefs: options.ac,
    sourceSkill: toRepoRelative(context.repoRoot, skillPath),
  };
  if (options.output) fs.writeFileSync(path.resolve(context.repoRoot, options.output), output.replace(/\r\n?/g, '\n'), 'utf8');
  else process.stdout.write(output);
  if (options.manifest) fs.writeFileSync(path.resolve(context.repoRoot, options.manifest), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  if (options.json) process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
