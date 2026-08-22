#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveConsumerContext, toRepoRelative } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

const STATUSES = new Set(['Pending', 'Implemented', 'ImplementedDifferently', 'NotImplemented']);
const BOUNDARIES = new Set(['step5', 'pre-step6', 'ship']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  const repeatable = new Set(['ac', 'file', 'test', 'commit', 'verdict', 'finding', 'aliasResult']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) positional.push(token);
    else {
      const key = token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = argv[++index];
      if (repeatable.has(key)) (options[key] ||= []).push(value);
      else options[key] = value;
    }
  }
  return { command: positional[0], options };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, file);
}

function criteriaFromSpec(text) {
  return [...text.matchAll(/^- (AC[1-9][0-9]*):\s*(.+)$/gm)].map((match) => ({ id: match[1], text: match[2].trim() }));
}

function defaultRow(criterion, planIndex) {
  const mapping = planIndex?.acceptanceCriteria?.find((row) => row.id === criterion.id);
  return {
    id: criterion.id,
    text: criterion.text,
    status: 'Pending',
    evidence: [],
    tasks: mapping?.taskIds || [],
    planSections: mapping?.planSectionIds || [],
    files: [],
    commits: [],
    tests: (mapping?.expectedTestNames || []).map((name) => ({
      name,
      sourceFile: null,
      phase: 'planned',
      alias: null,
      exitCode: null,
      timestamp: null,
    })),
    verdicts: [],
    findings: [],
    sabotage: { required: false, status: 'not-required', exitCode: null },
    linkEventIds: [],
  };
}

function init(options, context) {
  if (!options.spec || !options.output) throw new Error('init requires --spec and --output');
  const spec = path.resolve(context.repoRoot, options.spec);
  const planIndex = options.planIndex ? readJson(path.resolve(context.repoRoot, options.planIndex)) : null;
  const criteria = criteriaFromSpec(fs.readFileSync(spec, 'utf8'));
  if (!criteria.length) throw new Error('spec has no acceptance criteria');
  const ledger = {
    schemaVersion: 1,
    revision: 1,
    workflowId: options.workflowId || path.basename(path.dirname(path.resolve(context.repoRoot, options.output))),
    slug: options.slug || path.basename(path.dirname(path.resolve(context.repoRoot, options.output))),
    specPath: toRepoRelative(context.repoRoot, spec),
    planIndexPath: options.planIndex || null,
    declaredGaps: [],
    aliasResults: [],
    testingSkip: null,
    acceptanceCriteria: criteria.map((criterion) => defaultRow(criterion, planIndex)),
    scoreState: null,
  };
  writeJson(path.resolve(context.repoRoot, options.output), ledger);
  return ledger;
}

function parseObject(value, label) {
  try {
    const object = JSON.parse(value);
    if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error();
    return object;
  } catch {
    throw new Error(`${label} must be a JSON object`);
  }
}

function evidenceFile(value, context) {
  const match = value.match(/^(.+):L([1-9][0-9]*)-L([1-9][0-9]*)$/);
  if (!match) throw new Error(`file evidence must use path:Lstart-Lend: ${value}`);
  const absolute = path.resolve(context.repoRoot, match[1]);
  const relative = toRepoRelative(context.repoRoot, absolute);
  if (!fs.existsSync(absolute)) throw new Error(`file evidence does not exist: ${relative}`);
  const lines = fs.readFileSync(absolute, 'utf8').replace(/\r\n?/g, '\n').split('\n');
  const start = Number(match[2]);
  const end = Number(match[3]);
  if (end < start || end > lines.length) throw new Error(`file evidence line range is invalid: ${value}`);
  return { path: relative, lineStart: start, lineEnd: end, sha256: sha256(fs.readFileSync(absolute)) };
}

function validateTest(test, context) {
  for (const key of ['name', 'sourceFile', 'phase']) if (!test[key]) throw new Error(`test evidence requires ${key}`);
  if (!['planned', 'observed'].includes(test.phase)) throw new Error('test phase must be planned or observed');
  const source = path.resolve(context.repoRoot, test.sourceFile);
  if (!fs.existsSync(source)) throw new Error(`test source file does not exist: ${test.sourceFile}`);
  if (!fs.readFileSync(source, 'utf8').includes(test.name)) throw new Error(`test name not found in source file: ${test.name}`);
  return {
    name: String(test.name),
    sourceFile: toRepoRelative(context.repoRoot, source),
    phase: test.phase,
    alias: test.alias || null,
    exitCode: test.exitCode === null || test.exitCode === undefined ? null : Number(test.exitCode),
    timestamp: test.timestamp || new Date().toISOString(),
  };
}

function link(options, context) {
  if (!options.ledger || !options.eventId || !options.ac?.length) throw new Error('link requires --ledger, --event-id, and at least one --ac');
  const file = path.resolve(context.repoRoot, options.ledger);
  const ledger = readJson(file);
  const eventAlreadyApplied = ledger.acceptanceCriteria.some((row) => row.linkEventIds.includes(options.eventId));
  if (eventAlreadyApplied) return ledger;
  for (const ac of options.ac) {
    const row = ledger.acceptanceCriteria.find((item) => item.id === ac);
    if (!row) throw new Error(`unknown AC: ${ac}`);
    if (options.status) {
      if (!STATUSES.has(options.status)) throw new Error(`invalid semantic status: ${options.status}`);
      row.status = options.status;
    }
    for (const value of options.file || []) {
      const item = evidenceFile(value, context);
      row.files = [...row.files.filter((entry) => !(entry.path === item.path && entry.lineStart === item.lineStart && entry.lineEnd === item.lineEnd)), item]
        .sort((a, b) => a.path.localeCompare(b.path) || a.lineStart - b.lineStart);
      row.evidence = [...new Set([...row.evidence, `${item.path}:L${item.lineStart}-L${item.lineEnd}`])].sort();
    }
    for (const value of options.test || []) {
      const item = validateTest(parseObject(value, 'test'), context);
      row.tests = [...row.tests.filter((entry) => !(entry.name === item.name && entry.phase === item.phase)), item]
        .sort((a, b) => a.name.localeCompare(b.name) || a.phase.localeCompare(b.phase));
    }
    for (const value of options.commit || []) {
      const item = parseObject(value, 'commit');
      if (!/^[a-f0-9]{7,40}$/i.test(item.sha || '') || !Number.isInteger(Number(item.step))) throw new Error('commit requires sha and integer step');
      row.commits = [...row.commits.filter((entry) => entry.sha !== item.sha), { sha: item.sha, step: Number(item.step) }]
        .sort((a, b) => a.step - b.step || a.sha.localeCompare(b.sha));
    }
    for (const value of options.verdict || []) {
      const item = parseObject(value, 'verdict');
      if (!item.verdict || !item.evidence || !/^.+:L[1-9][0-9]*-L[1-9][0-9]*$/.test(item.evidence)) throw new Error('verdict requires verdict and file:Lx-Ly evidence');
      row.verdicts.push({ ...item, timestamp: item.timestamp || new Date().toISOString() });
    }
    for (const value of options.finding || []) {
      const item = parseObject(value, 'finding');
      if (!item.id || !['Critical', 'Warning', 'Suggestion'].includes(item.severity) || !['open', 'closed'].includes(item.state) || !item.evidence) {
        throw new Error('finding requires id, severity Critical|Warning|Suggestion, state open|closed, and evidence');
      }
      evidenceFile(item.evidence, context);
      const previous = row.findings.find((entry) => entry.id === item.id);
      if (previous && item.state === 'closed' && Number(item.round) <= Number(previous.round)) throw new Error('finding closure must occur in a later round');
      row.findings = [...row.findings.filter((entry) => entry.id !== item.id), { ...item, round: Number(item.round || 1) }]
        .sort((a, b) => a.id.localeCompare(b.id));
    }
    if (options.sabotageExit !== undefined) {
      const exitCode = Number(options.sabotageExit);
      row.sabotage = { required: true, status: exitCode === 0 ? 'passed' : 'failed', exitCode };
    }
    row.linkEventIds.push(options.eventId);
    row.linkEventIds.sort();
  }
  for (const value of options.aliasResult || []) {
    const result = parseObject(value, 'alias-result');
    if (!result.alias || result.exitCode === undefined || !result.command) throw new Error('alias result requires alias, command, and exitCode');
    const normalized = {
      alias: result.alias,
      commandHash: sha256(result.command),
      startedAt: result.startedAt || null,
      endedAt: result.endedAt || null,
      exitCode: Number(result.exitCode),
    };
    ledger.aliasResults = [...ledger.aliasResults.filter((entry) => entry.alias !== normalized.alias), normalized].sort((a, b) => a.alias.localeCompare(b.alias));
  }
  if (options.testSurfaceSkip) {
    const item = parseObject(options.testSurfaceSkip, 'test-surface-skip');
    if (!['no-test-surface', 'testing-disabled'].includes(item.reason) || !item.evidence) {
      throw new Error('test-surface-skip requires reason no-test-surface|testing-disabled and evidence');
    }
    const evidence = path.resolve(context.repoRoot, item.evidence);
    if (!fs.existsSync(evidence)) throw new Error(`test-surface skip evidence does not exist: ${item.evidence}`);
    ledger.testingSkip = { reason: item.reason, evidence: toRepoRelative(context.repoRoot, evidence), sha256: sha256(fs.readFileSync(evidence)) };
  }
  if (options.gap) ledger.declaredGaps = [...new Set([...ledger.declaredGaps, options.gap])].sort();
  ledger.revision += 1;
  ledger.scoreState = null;
  writeJson(file, ledger);
  return ledger;
}

function verifyFileHashes(ledger, context, errors) {
  for (const row of ledger.acceptanceCriteria) {
    for (const evidence of row.files) {
      const file = path.resolve(context.repoRoot, evidence.path);
      if (!fs.existsSync(file)) errors.push(`${row.id}: linked file is missing: ${evidence.path}`);
      else if (sha256(fs.readFileSync(file)) !== evidence.sha256) errors.push(`${row.id}: linked file hash changed: ${evidence.path}`);
    }
  }
}

function scoreLedger(ledger, boundary, context) {
  if (!BOUNDARIES.has(boundary)) throw new Error(`boundary must be one of: ${[...BOUNDARIES].join(', ')}`);
  const errors = [];
  verifyFileHashes(ledger, context, errors);
  let earned = 0;
  let total = 0;
  let knownDefect = ledger.declaredGaps.length > 0;
  let missingEvidence = false;
  const configuredAliases = Object.entries(context.config?.verification || {})
    .filter(([key, value]) => /(?:Build|Test|Format)$/.test(key) && typeof value === 'string' && value.trim() && !/^<.*>$/.test(value.trim()))
    .map(([key]) => key)
    .sort();
  for (const alias of configuredAliases) {
    const observed = ledger.aliasResults.find((item) => item.alias === alias);
    if (!observed) errors.push(`configured verification alias lacks observed result: ${alias}`);
    else if (observed.exitCode !== 0) knownDefect = true;
  }
  const validTestingSkip = ledger.testingSkip
    && fs.existsSync(path.resolve(context.repoRoot, ledger.testingSkip.evidence))
    && sha256(fs.readFileSync(path.resolve(context.repoRoot, ledger.testingSkip.evidence))) === ledger.testingSkip.sha256;
  for (const row of ledger.acceptanceCriteria) {
    total += 10;
    if (['Implemented', 'ImplementedDifferently'].includes(row.status)) earned += 4;
    else if (row.status === 'NotImplemented') knownDefect = true;
    if (row.files.length && !errors.some((error) => error.startsWith(`${row.id}: linked file`))) earned += 3;
    else missingEvidence = true;
    const mapped = row.tests.some((test) => {
      if (!test.name || !test.sourceFile) return false;
      const source = path.resolve(context.repoRoot, test.sourceFile);
      if (!fs.existsSync(source) || !fs.readFileSync(source, 'utf8').includes(test.name)) return false;
      if (boundary === 'ship') return test.phase === 'observed' && test.exitCode === 0;
      return test.phase === 'planned' || (test.phase === 'observed' && test.exitCode === 0);
    }) || (boundary === 'ship' && validTestingSkip);
    if (mapped) earned += 2;
    else missingEvidence = true;
    if (row.tasks.length || row.planSections.length) earned += 1;
    if (row.sabotage.required && row.sabotage.status !== 'passed') knownDefect = true;
    if (row.findings.some((finding) => finding.state === 'open' && ['Critical', 'Warning'].includes(finding.severity))) knownDefect = true;
    if (boundary === 'pre-step6' && !row.commits.length) errors.push(`${row.id}: product commit linkage required before step 6`);
  }
  if (ledger.aliasResults.some((result) => result.exitCode !== 0)) knownDefect = true;
  let score = total ? Math.floor((10 * earned) / total) : 0;
  if (knownDefect) score = Math.min(score, 8);
  else if (missingEvidence) score = Math.min(score, 9);
  const completeTen = !knownDefect && !missingEvidence && !errors.length && ledger.acceptanceCriteria.every((row) => row.status === 'Implemented' || row.status === 'ImplementedDifferently');
  if (!completeTen) score = Math.min(score, 9);
  return { boundary, score, earnedUnits: earned, totalUnits: total, knownDefect, missingEvidence, errors };
}

function verify(options, context, persistScore) {
  if (!options.ledger) throw new Error('verify requires --ledger');
  const file = path.resolve(context.repoRoot, options.ledger);
  const ledger = readJson(file);
  const result = scoreLedger(ledger, options.boundary || 'step5', context);
  if (persistScore) {
    ledger.scoreState = { ...result, computedAt: new Date().toISOString() };
    ledger.revision += 1;
    writeJson(file, ledger);
  }
  return result;
}

function report(options, context) {
  if (!options.ledger || !options.output) throw new Error('report requires --ledger and --output');
  const ledger = readJson(path.resolve(context.repoRoot, options.ledger));
  const score = scoreLedger(ledger, options.boundary || 'ship', context);
  const lines = [
    '# Acceptance criteria ledger report',
    '',
    `Derived score: ${score.score}/10`,
    `Boundary: ${score.boundary}`,
    '',
    '| AC | Status | Files | Tests | Findings | Sabotage |',
    '|---|---|---:|---:|---:|---|',
  ];
  for (const row of ledger.acceptanceCriteria) {
    const open = row.findings.filter((finding) => finding.state === 'open').length;
    lines.push(`| ${row.id} | ${row.status} | ${row.files.length} | ${row.tests.length} | ${open} | ${row.sabotage.status} |`);
  }
  if (score.errors.length) lines.push('', '## Verification errors', '', ...score.errors.map((error) => `- ${error}`));
  lines.push('');
  fs.writeFileSync(path.resolve(context.repoRoot, options.output), lines.join('\n'), 'utf8');
  return score;
}

function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  let result;
  if (command === 'init') result = init(options, context);
  else if (command === 'link') result = link(options, context);
  else if (command === 'verify') result = verify(options, context, false);
  else if (command === 'score') result = verify(options, context, true);
  else if (command === 'report') result = report(options, context);
  else throw new Error('command must be init, link, verify, score, or report');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (command === 'verify' && result.errors.length) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { scoreLedger, verifyFileHashes, criteriaFromSpec, readJson };
