#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  resolveConsumerContext,
  resolveConfiguredPath,
  toRepoRelative,
} = require('./resolve_consumer_root.cjs');
const { scoreLedger } = require('../../ws-spec-to-pr/scripts/ac_ledger.cjs');
const { syncAcCountsFromLedger } = require('./ac_counts.cjs');
const { loadJsonSchema, validateNode } = require('./validate_json_schema.cjs');

const STATE_VERSION = 2;
const SCHEMA_VERSION = 1;
const SKIP_REASONS = new Set([
  'interview-not-required',
  'dag-disabled',
  'testing-disabled',
  'no-test-surface',
  'fix-pr-not-applicable',
]);
const RUNTIME_NAMES = [
  /^started-at\.txt$/,
  /^workflow-id\.txt$/,
  /^baseline\.txt$/,
  /^sentinel\.pid$/,
  /^revision$/,
  /^blocked-reason$/,
  /^round-\d+\.md$/,
  /^final\.md$/,
  /^plan-gate\.md$/,
  /^resolve-[A-Za-z0-9_-]+\.txt$/,
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function cleanScalar(value) {
  const raw = String(value ?? '').trim();
  const unquoted = raw.replace(/^(['"])([\s\S]*)\1$/, '$2');
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;
  if (unquoted === 'null' || unquoted === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(unquoted)) return Number(unquoted);
  return unquoted;
}

function splitInline(value) {
  const parts = [];
  let current = '';
  let quote = '';
  let depth = 0;
  for (const character of value) {
    if (quote) {
      current += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
    } else if (character === '{' || character === '[') {
      depth += 1;
      current += character;
    } else if (character === '}' || character === ']') {
      depth -= 1;
      current += character;
    } else if (character === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseInline(value) {
  const raw = value.trim();
  if (raw === '[]') return [];
  if (raw === '{}') return {};
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return splitInline(raw.slice(1, -1)).map((item) => parseValue(item));
  }
  if (raw.startsWith('{') && raw.endsWith('}')) {
    const object = {};
    for (const item of splitInline(raw.slice(1, -1))) {
      const match = item.match(/^["']?([A-Za-z0-9_-]+)["']?\s*:\s*([\s\S]*)$/);
      if (match) object[match[1]] = parseValue(match[2]);
    }
    return object;
  }
  return cleanScalar(raw);
}

function parseValue(value) {
  const raw = String(value).trim();
  return /^[{[]/.test(raw) ? parseInline(raw) : cleanScalar(raw);
}

function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n?/g, '\n');
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) throw new Error('frontmatter YAML marker not found');
  const data = {};
  const lines = match[1].split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const top = lines[index].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!top) continue;
    const [, key, raw] = top;
    if (raw !== '') {
      data[key] = parseValue(raw);
      continue;
    }
    const block = [];
    while (index + 1 < lines.length && (/^\s+/.test(lines[index + 1]) || lines[index + 1].trim() === '')) {
      block.push(lines[++index]);
    }
    const nonEmpty = block.filter((line) => line.trim());
    if (nonEmpty.every((line) => line.trim().startsWith('-'))) {
      data[key] = nonEmpty.map((line) => parseValue(line.trim().slice(1).trim()));
    } else {
      const nested = {};
      for (const line of nonEmpty) {
        const item = line.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
        if (item) nested[item[1]] = parseValue(item[2]);
      }
      data[key] = nested;
    }
  }
  return { data, body: normalized.slice(match[0].length), frontmatter: match[1] };
}

function scalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const text = String(value);
  if (!text || /[:#,\n[\]{}]|^\s|\s$/.test(text)) return JSON.stringify(text);
  return text;
}

function inlineObject(value) {
  return `{ ${Object.entries(value).map(([key, item]) => `${key}: ${scalar(item)}`).join(', ')} }`;
}

function upsertArtifactFrontmatter(text, fields) {
  const normalized = String(text).replace(/\r\n?/g, '\n');
  let data = {};
  let body = normalized;
  try {
    const parsed = parseFrontmatter(normalized);
    data = parsed.data;
    body = parsed.body;
  } catch (error) {
    if (!/frontmatter YAML marker not found/.test(error.message)) throw error;
  }
  return `---\n${serializeFrontmatter({ ...data, ...fields })}\n---\n${body.replace(/^\n*/, '')}`;
}

function artifactStampFields(state, step, now) {
  return {
    step,
    slug: state.slug,
    workflowId: state.workflowId,
    status: state.status || 'completed',
    startedAt: state.startedAt || now,
    endedAt: now,
    acRefs: Array.isArray(state.acRefs) ? state.acRefs : [],
  };
}

function finishArtifactName(slug, step) {
  const names = {
    0: `step-00-${slug}.spec.md`,
    1: `step-01-${slug}.plan.md`,
    2: `step-02-${slug}.plan.refined.md`,
    3: `step-03-${slug}.plan.exec.md`,
    5: `step-05-${slug}.plan.report.md`,
    6: `step-06-${slug}.review.md`,
    7: `step-07-${slug}.testing.report.md`,
    8: `step-08-${slug}.result.md`,
  };
  return names[step];
}

function stampStepArtifact(file, state, step) {
  if (!file || !fs.existsSync(file)) return false;
  const now = new Date().toISOString();
  const fields = artifactStampFields(state, step, now);
  try {
    const previous = parseFrontmatter(fs.readFileSync(file, 'utf8')).data;
    if (previous.startedAt) fields.startedAt = previous.startedAt;
    if (previous.endedAt) fields.endedAt = previous.endedAt;
  } catch {
    // body-only artifacts get a new metadata block
  }
  atomicWrite(file, upsertArtifactFrontmatter(fs.readFileSync(file, 'utf8'), fields));
  return true;
}

function serializeFrontmatter(data) {
  const lines = [];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      if (!value.length) lines.push(`${key}: []`);
      else {
        lines.push(`${key}:`);
        for (const item of value) lines.push(`  - ${item && typeof item === 'object' ? inlineObject(item) : scalar(item)}`);
      }
    } else if (value && typeof value === 'object') {
      if (!Object.keys(value).length) lines.push(`${key}: {}`);
      else {
        lines.push(`${key}:`);
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          if (Array.isArray(nestedValue)) {
            if (!nestedValue.length) lines.push(`  ${nestedKey}: []`);
            else lines.push(`  ${nestedKey}: ${JSON.stringify(nestedValue)}`);
          } else if (nestedValue && typeof nestedValue === 'object') {
            lines.push(`  ${nestedKey}: ${inlineObject(nestedValue)}`);
          } else lines.push(`  ${nestedKey}: ${scalar(nestedValue)}`);
        }
      }
    } else lines.push(`${key}: ${scalar(value)}`);
  }
  return lines.join('\n');
}

function atomicWrite(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  const handle = fs.openSync(temporary, 'w');
  try {
    fs.writeFileSync(handle, content, 'utf8');
    try {
      fs.fsyncSync(handle);
    } catch (error) {
      if (!error || !['EPERM', 'EINVAL'].includes(error.code)) throw error;
    }
  } finally {
    fs.closeSync(handle);
  }
  fs.renameSync(temporary, file);
}

function appendJsonl(file, record) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(record)}\n`, 'utf8');
}

function listArg(value) {
  if (!value) return [];
  return String(value).split(',').map((item) => item.trim().replace(/\\/g, '/')).filter(Boolean);
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) positional.push(token);
    else {
      const key = token.slice(2).replace(/-([a-z])/g, (_, character) => character.toUpperCase());
      if (['json', 'preAdvance', 'estimated'].includes(key) && (index + 1 >= argv.length || argv[index + 1].startsWith('--'))) options[key] = true;
      else options[key] = argv[++index];
    }
  }
  return { positional, options };
}

function normalizeFable(value) {
  if (value === true || value === 'true' || value === undefined || value === null) return 'refuted';
  if (value === false || value === 'false') return false;
  if (value === 'refuted' || value === 'caveats') return value;
  throw new Error('fable.auditVerdictsBlockShip must be false, "refuted", or "caveats"');
}

function fableBlocks(value, verdict) {
  const normalized = normalizeFable(value);
  const upper = String(verdict || '').toUpperCase();
  if (upper === 'REFUTED') return true;
  return normalized === 'caveats' && upper === 'VERIFIED WITH CAVEATS';
}

function commonEvent(state, pipeline, step, type, timestamp, options, context) {
  const packageFile = path.join(context.repoRoot, 'package.json');
  const packageVersion = fs.existsSync(packageFile) ? JSON.parse(fs.readFileSync(packageFile, 'utf8')).version : 'unknown';
  return {
    schemaVersion: SCHEMA_VERSION,
    type,
    timestamp,
    workflowId: String(state.workflowId || ''),
    pipeline,
    packageVersion,
    step,
    model: String(options.model || state.currentModel || 'unknown'),
    retries: Number(options.retries || 0),
    reviewRounds: Number(options.reviewRounds || 0),
    refineRounds: Number(options.refineRounds || 0),
    skipReason: options.reason || null,
    acTotal: Number(options.acTotal || state.acTotal || 0),
    acImplemented: Number(options.acImplemented || state.acImplemented || 0),
  };
}

function readStepOutput(value, context) {
  if (!value) return {};
  const candidate = path.resolve(context.repoRoot, value);
  const raw = fs.existsSync(candidate) ? fs.readFileSync(candidate, 'utf8') : value;
  try {
    return JSON.parse(raw);
  } catch {
    return { summary: String(raw).slice(0, 2000) };
  }
}

function compactOutputs(body, step, output) {
  const heading = '## Step outputs (compact)';
  const line = `- Step ${step}: ${String(output.summary || output.status || 'completed').replace(/\s+/g, ' ').slice(0, 240)}`;
  if (!body.includes(heading)) return `${body.replace(/\s*$/, '\n\n')}${heading}\n\n${line}\n`;
  const expression = new RegExp(`(${heading}\\n\\n)([\\s\\S]*?)(?=\\n## |$)`);
  return body.replace(expression, (_, prefix, content) => {
    const rows = content.trim().split('\n').filter((item) => item && !item.startsWith(`- Step ${step}:`));
    rows.push(line);
    rows.sort((a, b) => Number(a.match(/Step (\d+)/)?.[1] || 0) - Number(b.match(/Step (\d+)/)?.[1] || 0));
    return `${prefix}${rows.join('\n')}\n`;
  });
}

function dispatchTimestamp(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.dispatchedAt || entry.dispatched || '');
}

function estimatedSteps(context, pipeline, maxStep) {
  const aggregateFile = resolveConfiguredPath(
    context.repoRoot,
    context.config?.telemetry?.aggregateFile || path.join(context.config?.plans?.dir || '.agents/plans', 'telemetry', 'aggregate.json'),
  );
  let medians = {};
  try {
    const aggregate = JSON.parse(fs.readFileSync(aggregateFile, 'utf8'));
    medians = aggregate.medians?.[pipeline]?.steps || aggregate.medians?.byPipeline?.[pipeline]?.steps || {};
  } catch {
    medians = {};
  }
  return Array.from({ length: maxStep + 1 }, (_, step) => Number(
    typeof medians[String(step)] === 'number' ? medians[String(step)] : medians[String(step)]?.elapsedSec || 0,
  ));
}

function renderRun(run, labels) {
  const lines = [
    '# Workflow progress',
    '',
    `Workflow: ${run.workflowId}`,
    `Status: ${run.status}`,
    `Current step: ${run.currentStep}`,
    `Next action: ${run.nextAction}`,
    '',
    '| Step | Label | Status | Remaining |',
    '|---:|---|---|---:|',
  ];
  for (const step of run.steps) {
    lines.push(`| ${step.step} | ${labels[step.step] || `Step ${step.step}`} | ${step.status} | ${step.estimatedRemainingSec}s |`);
  }
  lines.push('', `ACs: ${run.acImplemented}/${run.acTotal}`, `Score: ${run.score ?? 'n/a'}`, '');
  return lines.join('\n');
}

function buildRun(state, pipeline, maxStep, labels, stateHash, medians) {
  const currentStep = Number(state.currentStep || 0);
  const completed = new Set((state.completedSteps || []).map(Number));
  const skipped = new Map((state.skippedSteps || []).map((item) => [Number(item.step), item.reason]));
  let remaining = 0;
  const steps = Array.from({ length: maxStep + 1 }, (_, step) => {
    const status = skipped.has(step) ? 'skipped' : completed.has(step) ? 'completed' : step === currentStep ? 'active' : 'pending';
    const estimate = status === 'pending' || status === 'active' ? Number(medians[step] || 0) : 0;
    remaining += estimate;
    return { step, status, skipReason: skipped.get(step) || null, estimatedRemainingSec: estimate };
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: Number(state.revision || 0),
    workflowId: String(state.workflowId || ''),
    slug: String(state.slug || state.us || ''),
    pipeline,
    status: String(state.status || 'active'),
    currentStep,
    pendingGate: state.pendingGate || null,
    nextAction: String(state.nextAction || `Run step ${currentStep}`),
    acTotal: Number(state.acTotal || 0),
    acImplemented: Number(state.acImplemented || 0),
    score: state.verificationScore ?? null,
    estimatedRemainingSec: remaining,
    steps,
    statePath: state.statePath,
    stateSha256: stateHash,
  };
}

function plansIndexPath(context) {
  const plansDir = resolveConfiguredPath(context.repoRoot, context.config?.plans?.dir, '.agents/plans');
  return path.join(plansDir, 'index.json');
}

function updatePlansIndex(context, run, timestamp) {
  const file = plansIndexPath(context);
  let index = { schemaVersion: SCHEMA_VERSION, revision: run.revision, generatedAt: timestamp, workflows: [] };
  try {
    index = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    index = { schemaVersion: SCHEMA_VERSION, workflows: [] };
  }
  const row = {
    workflowId: run.workflowId,
    slug: run.slug,
    pipeline: run.pipeline,
    statePath: run.statePath,
    stateSha256: run.stateSha256,
    status: run.status,
    currentStep: run.currentStep,
    updatedAt: timestamp,
    runPath: `${path.posix.dirname(run.statePath)}/run.json`,
  };
  index.schemaVersion = SCHEMA_VERSION;
  index.revision = run.revision;
  index.generatedAt = timestamp;
  index.workflows = [...(index.workflows || []).filter((item) => item.workflowId !== row.workflowId), row]
    .sort((a, b) => a.workflowId.localeCompare(b.workflowId));
  return { file, index };
}

function validateGateDecision(value) {
  if (!value) return null;
  const parsed = typeof value === 'string' ? JSON.parse(value) : value;
  const keys = Object.keys(parsed).sort().join(',');
  if (keys !== 'choice,gate,reason,round' || !Number.isInteger(Number(parsed.round))) {
    throw new Error('gateDecision must contain gate, choice, reason, and integer round only');
  }
  return { gate: String(parsed.gate), choice: String(parsed.choice), reason: String(parsed.reason), round: Number(parsed.round) };
}

function statePaths(stateFile, context) {
  const statePath = toRepoRelative(context.repoRoot, stateFile);
  return {
    statePath,
    usDir: path.dirname(stateFile),
    runFile: path.join(path.dirname(stateFile), 'run.json'),
    runMarkdown: path.join(path.dirname(stateFile), 'RUN.md'),
  };
}

function performUpdate({ pipeline, maxStep, labels }, operation, stateFile, options) {
  if (!['dispatch', 'finish', 'bypass'].includes(operation)) throw new Error('operation must be dispatch, finish, or bypass');
  if (options.elapsed !== undefined) throw new Error('--elapsed is not accepted; elapsedSec is derived from timestamps');
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: options.scriptFile });
  const absoluteState = path.resolve(context.repoRoot, stateFile);
  if (!fs.existsSync(absoluteState)) throw new Error(`state file not found: ${stateFile}`);
  const parsed = parseFrontmatter(fs.readFileSync(absoluteState, 'utf8'));
  const state = parsed.data;
  const step = Number(options.step);
  if (!Number.isInteger(step) || step < 0 || step > maxStep) throw new Error(`step must be in range 0..${maxStep}`);
  const timestamp = String(options.timestamp || options.finishedAt || options.dispatchedAt || nowIso());
  const paths = statePaths(absoluteState, context);
  syncAcCountsFromLedger(state, paths.usDir);
  state.stateVersion = STATE_VERSION;
  state.revision = Number(state.revision || 0) + 1;
  state.workflowType = pipeline;
  state.workflowId ||= path.basename(absoluteState, '.state.md');
  state.slug ||= state.us || path.basename(path.dirname(absoluteState));
  state.statePath = paths.statePath;
  state.stepStatus = state.stepStatus && typeof state.stepStatus === 'object' ? state.stepStatus : {};
  state.stepDispatches = Array.isArray(state.stepDispatches) ? state.stepDispatches : [];
  let body = parsed.body;
  let event;

  if (operation === 'dispatch') {
    state.currentStep = step;
    state.stepStatus[String(step)] = 'active';
    const dispatch = { step, dispatchedAt: timestamp };
    state.stepDispatches = [...state.stepDispatches.filter((item) => Number(item.step) !== step), dispatch].sort((a, b) => a.step - b.step);
    state.currentModel = String(options.model || state.currentModel || 'unknown');
    state.nextAction = `Finish step ${step}`;
    event = commonEvent(state, pipeline, step, 'dispatch', timestamp, options, context);
    event.dispatchedAt = timestamp;
  } else if (operation === 'finish') {
    const dispatch = state.stepDispatches.find((item) => Number(item.step) === step);
    const dispatchedAt = String(options.dispatchedAt || dispatchTimestamp(dispatch));
    const finishedAt = timestamp;
    const elapsedSec = dispatchedAt ? Math.max(0, Math.floor((Date.parse(finishedAt) - Date.parse(dispatchedAt)) / 1000)) : 0;
    const estimated = !dispatchedAt;
    const status = String(options.status || 'completed');
    if (!['completed', 'failed', 'skipped'].includes(status)) throw new Error('finish status must be completed, failed, or skipped');
    if (status === 'skipped') {
      if (!SKIP_REASONS.has(options.reason)) throw new Error(`skip reason must be one of: ${[...SKIP_REASONS].join(', ')}`);
      state.skippedSteps = [...(Array.isArray(state.skippedSteps) ? state.skippedSteps : []).filter((item) => Number(item.step) !== step), {
        step,
        reason: options.reason,
        evidence: String(options.evidence || ''),
      }].sort((a, b) => a.step - b.step);
    }
    state.completedSteps = [...new Set([...(state.completedSteps || []).map(Number), step])].sort((a, b) => a - b);
    state.stepStatus[String(step)] = status;
    state.currentStep = Math.min(maxStep, step + 1);
    state.nextAction = status === 'failed' ? `Repair step ${step}` : `Run step ${state.currentStep}`;
    const output = readStepOutput(options.stepOutput, context);
    body = compactOutputs(body, step, output);
    const created = listArg(options.created || output.files_touched?.created?.join(','));
    const modified = listArg(options.modified || output.files_touched?.modified?.join(','));
    const deleted = listArg(options.deleted || output.files_touched?.deleted?.join(','));
    state.workflowManifest = state.workflowManifest && typeof state.workflowManifest === 'object' ? state.workflowManifest : {};
    for (const key of ['created', 'modified', 'deleted']) {
      state.workflowManifest[key] = [...new Set([...(state.workflowManifest[key] || []), ...({ created, modified, deleted }[key])])].sort();
    }
    const gateDecision = validateGateDecision(options.gateDecision);
    if (gateDecision) state.gateDecision = gateDecision;
    let derivedScore = null;
    if (options.verificationScore !== undefined) {
      const ledgerFile = path.join(paths.usDir, 'ac-ledger.json');
      if (!fs.existsSync(ledgerFile)) throw new Error('verification score requires ac-ledger.json');
      const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      const derived = scoreLedger(ledger, options.scoreBoundary || 'step5', context);
      if (Number(options.verificationScore) !== derived.score) {
        throw new Error(`verification score mismatch: supplied ${options.verificationScore}, derived ${derived.score}`);
      }
      derivedScore = derived.score;
      state.verificationScore = derivedScore;
    }
    if (options.fableVerdict !== undefined) {
      if (fableBlocks(context.config?.fable?.auditVerdictsBlockShip, options.fableVerdict)) throw new Error(`fable verdict blocks this transition: ${options.fableVerdict}`);
      state.fableVerdict = options.fableVerdict;
    }
    event = {
      ...commonEvent(state, pipeline, step, 'finish', finishedAt, options, context),
      dispatchedAt: dispatchedAt || null,
      finishedAt,
      elapsedSec,
      estimated,
      promptTokens: Number(options.promptTokens || 0),
      completionTokens: Number(options.completionTokens || 0),
      filesTouched: { created, modified, deleted },
      gateDecision,
      score: derivedScore,
      verdict: options.fableVerdict || null,
      errors: listArg(options.errors),
    };
  } else {
    if (!options.gate || !options.reason) throw new Error('bypass requires --gate and --reason');
    event = {
      ...commonEvent(state, pipeline, step, 'gate-bypass', timestamp, options, context),
      gate: String(options.gate),
      reason: String(options.reason),
    };
    state.nextAction ||= `Run step ${step}`;
  }

  syncAcCountsFromLedger(state, paths.usDir);
  if (Array.isArray(state.stepDispatches)) {
    state.stepDispatches = state.stepDispatches
      .map((item) => {
        const dispatchedAt = dispatchTimestamp(item);
        return dispatchedAt
          ? { step: Number(item.step), dispatchedAt }
          : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.step - b.step);
  }
  const stateContent = `---\n${serializeFrontmatter(state)}\n---\n${body.replace(/^\n*/, '')}`;
  const stateHash = sha256(stateContent);
  const medians = estimatedSteps(context, pipeline, maxStep);
  const run = buildRun(state, pipeline, maxStep, labels, stateHash, medians);
  const index = updatePlansIndex(context, run, timestamp);
  const telemetryFile = path.resolve(context.repoRoot, options.jsonlOut || path.join(paths.usDir, 'telemetry', `step-${String(step).padStart(2, '0')}.jsonl`));

  appendJsonl(telemetryFile, event);
  atomicWrite(absoluteState, stateContent);
  atomicWrite(paths.runFile, `${JSON.stringify(run, null, 2)}\n`);
  atomicWrite(paths.runMarkdown, renderRun(run, labels));
  atomicWrite(index.file, `${JSON.stringify(index.index, null, 2)}\n`);
  if (operation === 'finish') {
    const artifact = finishArtifactName(state.slug, step);
    if (artifact) stampStepArtifact(path.join(paths.usDir, artifact), state, step);
  }
  validateSnapshot({ stateFile: absoluteState, runFile: paths.runFile, indexFile: index.file, context, maxStep });
  return { ok: true, operation, step, revision: state.revision, stateSha256: stateHash, runPath: toRepoRelative(context.repoRoot, paths.runFile) };
}

function artifactMetadata(file, expectedStep, state) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) {
    const meta = JSON.parse(text)._meta;
    if (!meta) throw new Error(`JSON artifact lacks _meta: ${file}`);
    return meta;
  }
  const parsed = parseFrontmatter(text).data;
  const required = ['step', 'slug', 'workflowId', 'status', 'startedAt', 'endedAt', 'acRefs'];
  for (const key of required) if (parsed[key] === undefined) throw new Error(`artifact metadata missing ${key}: ${file}`);
  if (Number(parsed.step) !== expectedStep || parsed.slug !== state.slug || parsed.workflowId !== state.workflowId) {
    throw new Error(`artifact metadata identity mismatch: ${file}`);
  }
  if (Number.isNaN(Date.parse(parsed.startedAt)) || (parsed.endedAt && Number.isNaN(Date.parse(parsed.endedAt)))) {
    throw new Error(`artifact timestamps invalid: ${file}`);
  }
  const acRefs = parsed.acRefs || [];
  if (!Array.isArray(acRefs) || new Set(acRefs).size !== acRefs.length) throw new Error(`artifact acRefs invalid: ${file}`);
  return parsed;
}

function validateRuntime(usDir) {
  const runtime = path.join(usDir, '.runtime');
  if (!fs.existsSync(runtime)) return [];
  return fs.readdirSync(runtime).filter((name) => !RUNTIME_NAMES.some((pattern) => pattern.test(name)));
}

function validateSnapshot({ stateFile, runFile, indexFile, context, maxStep, preAdvance }) {
  const parsed = parseFrontmatter(fs.readFileSync(stateFile, 'utf8'));
  const state = parsed.data;
  const errors = [];
  for (const key of ['workflowId', 'status', 'currentStep', 'stateVersion', 'revision']) {
    if (state[key] === undefined) errors.push(`mandatory key missing: ${key}`);
  }
  if (Number(state.stateVersion) !== STATE_VERSION) errors.push(`stateVersion must equal ${STATE_VERSION}`);
  if (Number(state.currentStep) < 0 || Number(state.currentStep) > maxStep) errors.push(`currentStep outside 0..${maxStep}`);
  for (const item of state.skippedSteps || []) {
    if (!item || !SKIP_REASONS.has(item.reason) || !Number.isInteger(Number(item.step))) errors.push('skippedSteps entry has invalid reason or step');
  }
  if (state.gateDecision !== undefined) {
    try { validateGateDecision(state.gateDecision); } catch (error) { errors.push(error.message); }
  }
  const actualHash = sha256(fs.readFileSync(stateFile, 'utf8'));
  if (fs.existsSync(runFile)) {
    const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
    if (run.revision !== Number(state.revision) || run.stateSha256 !== actualHash) errors.push('run.json revision/state hash mismatch');
    const runSchema = path.join(__dirname, '..', 'run.schema.json');
    errors.push(...validateNode(run, loadJsonSchema(runSchema, 'run schema'), 'run.json'));
  }
  if (fs.existsSync(indexFile)) {
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const row = index.workflows?.find((item) => item.workflowId === state.workflowId);
    if (!row || row.stateSha256 !== actualHash || index.revision !== Number(state.revision)) errors.push('plans index revision/state hash mismatch');
  }
  const unknownRuntime = validateRuntime(path.dirname(stateFile));
  if (unknownRuntime.length) errors.push(`unknown .runtime residue: ${unknownRuntime.join(', ')}`);
  if (preAdvance !== undefined) {
    const next = Number(preAdvance);
    const artifactNames = {
      1: `step-00-${state.slug}.spec.md`,
      2: `step-01-${state.slug}.plan.md`,
      3: `step-02-${state.slug}.plan.refined.md`,
      4: `step-03-${state.slug}.plan.exec.md`,
      6: `step-05-${state.slug}.plan.report.md`,
      7: `step-06-${state.slug}.review.md`,
      8: `step-07-${state.slug}.testing.report.md`,
      9: `step-08-${state.slug}.result.md`,
    };
    const required = artifactNames[next];
    if (required) {
      const file = path.join(path.dirname(stateFile), required);
      if (!fs.existsSync(file)) errors.push(`required artifact missing: ${toRepoRelative(context.repoRoot, file)}`);
      else {
        try { artifactMetadata(file, next - 1, state); } catch (error) { errors.push(error.message); }
      }
    }
    const ledgerFile = path.join(path.dirname(stateFile), 'ac-ledger.json');
    if (next >= 1 && !fs.existsSync(ledgerFile)) errors.push('ac-ledger.json is required before advance');
    if (next >= 6 && fs.existsSync(ledgerFile)) {
      const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
      const boundary = next === 6 ? 'pre-step6' : next >= 9 ? 'ship' : 'step5';
      let derived;
      try {
        derived = scoreLedger(ledger, boundary, context);
      } catch (error) {
        errors.push(`ledger verification failed: ${error.message}`);
      }
      if (!derived || derived.score < 9) errors.push('ledger score must be at least 9 before step 6');
      if (!ledger.scoreState || Number(ledger.scoreState.score) !== derived?.score || ledger.scoreState.boundary !== boundary) {
        errors.push(`ledger scoreState must match derived ${boundary} score`);
      }
      for (const error of derived?.errors || []) errors.push(`ledger: ${error}`);
      if ((ledger.acceptanceCriteria || []).some((row) => !row.commits?.length)) errors.push('every AC requires a linked product commit before step 6');
      const verdicts = (ledger.acceptanceCriteria || []).flatMap((row) => row.verdicts || []);
      const blocking = verdicts.find((item) => fableBlocks(context.config?.fable?.auditVerdictsBlockShip, item.verdict));
      if (blocking) errors.push(`ledger fable verdict blocks transition: ${blocking.verdict}`);
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
  return { ok: true, workflowId: state.workflowId, revision: Number(state.revision), stateSha256: actualHash };
}

function runUpdateCli(config) {
  try {
    const { positional, options } = parseArgs(process.argv.slice(2));
    const [operation, stateFile] = positional;
    options.scriptFile = config.scriptFile;
    const result = performUpdate(config, operation, stateFile, options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}

function resolveStateFile(input, context) {
  const direct = path.resolve(context.repoRoot, input);
  if (fs.existsSync(direct)) return direct;
  const plansDir = resolveConfiguredPath(context.repoRoot, context.config?.plans?.dir, '.agents/plans');
  const names = input.endsWith('.state.md') ? [input] : [input, `${input}.state.md`];
  const indexFile = path.join(plansDir, 'index.json');
  if (fs.existsSync(indexFile)) {
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    const row = (index.workflows || []).find((item) => item.workflowId === input || names.some((name) => path.posix.basename(item.statePath) === name));
    if (row) return path.resolve(context.repoRoot, row.statePath);
    return direct;
  }
  const stack = [plansDir];
  while (stack.length) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (names.includes(entry.name)) return full;
    }
  }
  return direct;
}

function rebuildIndex(context, config) {
  const plansDir = resolveConfiguredPath(context.repoRoot, context.config?.plans?.dir, '.agents/plans');
  const workflows = [];
  const stack = [plansDir];
  for (const current of stack) {
    if (!fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith('.state.md')) {
        const state = parseFrontmatter(fs.readFileSync(full, 'utf8')).data;
        const hash = sha256(fs.readFileSync(full, 'utf8'));
        workflows.push({
          workflowId: state.workflowId,
          slug: state.slug || state.us,
          pipeline: state.workflowType || config.pipeline,
          statePath: toRepoRelative(context.repoRoot, full),
          stateSha256: hash,
          status: state.status,
          currentStep: Number(state.currentStep || 0),
          updatedAt: nowIso(),
          runPath: `${path.posix.dirname(toRepoRelative(context.repoRoot, full))}/run.json`,
        });
      }
    }
  }
  workflows.sort((a, b) => String(a.workflowId).localeCompare(String(b.workflowId)));
  const index = { schemaVersion: SCHEMA_VERSION, revision: 0, generatedAt: nowIso(), workflows };
  atomicWrite(plansIndexPath(context), `${JSON.stringify(index, null, 2)}\n`);
  return { ok: true, type: 'index-rebuilt', workflows: workflows.length };
}

function runValidateCli(config) {
  try {
    const { positional, options } = parseArgs(process.argv.slice(2));
    const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: config.scriptFile });
    if (positional[0] === 'rebuild-index') {
      process.stdout.write(`${JSON.stringify(rebuildIndex(context, config), null, 2)}\n`);
      return;
    }
    if (!positional[0]) throw new Error('state path or workflow id is required');
    const stateFile = resolveStateFile(positional[0], context);
    if (!fs.existsSync(stateFile)) throw new Error(`state file not found: ${positional[0]}`);
    const result = validateSnapshot({
      stateFile,
      runFile: path.join(path.dirname(stateFile), 'run.json'),
      indexFile: plansIndexPath(context),
      context,
      maxStep: config.maxStep,
      preAdvance: options.preAdvance === true ? undefined : options.preAdvance,
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  STATE_VERSION,
  SCHEMA_VERSION,
  SKIP_REASONS,
  RUNTIME_NAMES,
  sha256,
  parseFrontmatter,
  serializeFrontmatter,
  normalizeFable,
  fableBlocks,
  renderRun,
  validateGateDecision,
  artifactMetadata,
  upsertArtifactFrontmatter,
  artifactStampFields,
  stampStepArtifact,
  performUpdate,
  validateSnapshot,
  runUpdateCli,
  runValidateCli,
};
