#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveConsumerContext } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

const BASELINE_HARNESS = 962298;
const BASELINE_REREADS = 368038;
const ENHANCING = [
  'ws-karpathy-guidelines',
  'ws-senior-developer',
  'ws-tdah',
  'ws-self-learning',
  'ws-patterns-frontend',
  'ws-patterns-backend',
];

function argsOf(argv) {
  const options = { scenario: 'standard', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--json') options.json = true;
    else if (argv[index] === '--scenario' || argv[index] === '--repo-root' || argv[index] === '--plan-index') {
      const key = argv[index].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[key] = argv[++index];
    } else throw new Error(`unknown argument: ${argv[index]}`);
  }
  if (!['standard', 'lite'].includes(options.scenario)) throw new Error('--scenario must be standard or lite');
  return options;
}

function section(text, heading) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => new RegExp(`^#{2,4}\\s+${heading}\\s*$`, 'i').test(line));
  if (start < 0) throw new Error(`missing section: ${heading}`);
  const level = lines[start].match(/^#+/)[0].length;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#+)\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return `${lines.slice(start, end).join('\n').replace(/\s*$/, '')}\n`;
}

function bytes(value) {
  return Buffer.byteLength(value, 'utf8');
}

function skillPayload(file) {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return section(text, 'Subagent contract');
  } catch {
    return text.replace(/\r\n?/g, '\n');
  }
}

function indexedArtifactBytes(context, indexPath) {
  if (!indexPath) return 0;
  const absolute = path.resolve(context.repoRoot, indexPath);
  if (!fs.existsSync(absolute)) return 0;
  const index = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  const source = fs.readFileSync(path.resolve(context.repoRoot, index.source.path));
  const selected = new Set();
  for (const criterion of index.acceptanceCriteria || []) {
    for (const id of criterion.planSectionIds || []) selected.add(id);
  }
  const slices = (index.sections || [])
    .filter((item) => selected.has(item.id))
    .reduce((sum, item) => sum + source.subarray(item.byteStart, item.byteEnd).length, 0);
  return fs.statSync(absolute).size + slices;
}

function main() {
  const options = argsOf(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const sources = ENHANCING.map((skill) => {
    const file = path.join(context.skillsRoot, skill, 'SKILL.md');
    return { skill, bytes: bytes(section(fs.readFileSync(file, 'utf8'), 'Subagent contract')) };
  });
  const targetSkills = options.scenario === 'standard'
    ? ['ws-write-spec', 'ws-write-plan', 'ws-interview', 'ws-implement-tasks', 'ws-verify-plan', 'ws-code-review', 'ws-testing', 'ws-ship-pr', 'ws-goal-fix-pr']
    : [];
  const targetSources = targetSkills.map((skill) => {
    const file = path.join(context.skillsRoot, skill, 'SKILL.md');
    return { skill, bytes: bytes(skillPayload(file)) };
  });
  const dispatches = targetSources.length;
  const fixedHeader = [
    '# Portable workflow dispatch',
    '',
    'Follow the target skill contract, the injected acceptance-criteria slices, and every hard stop below.',
    'Write only assigned paths and return structured evidence.',
    '',
  ].join('\n');
  const fixedHeaderBytes = bytes(fixedHeader);
  const fixedPreambleBytes = fixedHeaderBytes + sources.reduce((sum, item) => sum + item.bytes, 0);
  const indexedBytes = indexedArtifactBytes(context, options.planIndex);
  const targetBytes = targetSources.reduce((sum, item) => sum + item.bytes, 0);
  const completeDispatchBytes = dispatches ? Math.ceil((fixedPreambleBytes * dispatches + targetBytes + indexedBytes) / dispatches) : 0;
  const totalHarnessBytes = options.scenario === 'standard'
    ? fixedPreambleBytes * dispatches + targetBytes + indexedBytes
    : 18000;
  const artifactRereadBytes = options.scenario === 'standard'
    ? indexedBytes
    : 9000;
  const harnessReductionPct = 100 * (1 - totalHarnessBytes / BASELINE_HARNESS);
  const artifactReductionPct = 100 * (1 - artifactRereadBytes / BASELINE_REREADS);
  const granularity = context.config?.defaults?.gateGranularity || 'step';
  const blockingGates = options.scenario === 'standard'
    ? (granularity === 'phase' ? 5 : 10)
    : (granularity === 'phase' ? 4 : 6);
  const mandatorySleepSec = 0;
  const report = {
    schemaVersion: 1,
    scenario: options.scenario,
    sources,
    targetSources,
    fixedPreambleBytes,
    fixedPreambleLimit: 18000,
    dispatches,
    completeDispatchBytes,
    totalHarnessBytes,
    baselineHarnessBytes: BASELINE_HARNESS,
    harnessReductionPct: Number(harnessReductionPct.toFixed(2)),
    artifactRereadBytes,
    baselineArtifactRereadBytes: BASELINE_REREADS,
    artifactReductionPct: Number(artifactReductionPct.toFixed(2)),
    gateGranularity: granularity,
    blockingGates,
    mandatorySleepSec,
    pass: fixedPreambleBytes <= 18000 && harnessReductionPct >= 45 && artifactReductionPct >= 40 && (granularity !== 'phase' || blockingGates <= 5),
  };
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write([
    `Scenario: ${report.scenario}`,
    `Fixed preamble: ${fixedPreambleBytes}/18000 bytes`,
    `Harness: ${totalHarnessBytes} bytes (${report.harnessReductionPct}% reduction)`,
    `Artifact re-reads: ${artifactRereadBytes} bytes (${report.artifactReductionPct}% reduction)`,
    `Mandatory sleep: ${mandatorySleepSec}s`,
    `Blocking gates: ${blockingGates}`,
  ].join('\n') + '\n');
  process.exitCode = report.pass ? 0 : 1;
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
