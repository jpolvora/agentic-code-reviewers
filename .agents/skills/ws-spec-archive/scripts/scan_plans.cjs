#!/usr/bin/env node
'use strict';

/**
 * Inventory {plansDir} workflow folders. Never writes.
 * Usage:
 *   node scan_plans.cjs --repo-root <root> --plans-dir <rel> --specs-dir <rel>
 *     [--slug <slug>] [--json]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveConsumerContext } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

const ELIGIBLE_STATUS = new Set(['completed', 'cancelled', 'failed']);
const KEEP_STATUS = new Set(['active', 'paused']);

function parseArgs(argv) {
  const opts = {
    json: true,
    slug: null,
    repoRoot: null,
    plansDir: null,
    specsDir: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--repo-root') opts.repoRoot = argv[++i];
    else if (a === '--plans-dir') opts.plansDir = argv[++i];
    else if (a === '--specs-dir') opts.specsDir = argv[++i];
    else if (a === '--slug') opts.slug = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function readUtf8(abs) {
  return fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
}

function stripQuotes(v) {
  const s = String(v).trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function parseState(text) {
  const fields = {};
  const keys = [
    'status', 'slug', 'title', 'prUrl', 'prNumber', 'currentStep',
    'workflowType', 'branch', 'endedAt', 'startedAt', 'shipAction',
    'specsPath', 'specPath', 'workflowId',
  ];
  for (const key of keys) {
    const m = text.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'));
    if (m) fields[key] = stripQuotes(m[1]);
  }
  if (fields.status) fields.status = fields.status.toLowerCase();
  if (fields.currentStep != null && fields.currentStep !== '') {
    const n = Number(fields.currentStep);
    if (!Number.isNaN(n)) fields.currentStep = n;
  }
  if (fields.prNumber != null && fields.prNumber !== '' && fields.prNumber !== 'null') {
    const n = Number(fields.prNumber);
    if (!Number.isNaN(n)) fields.prNumber = n;
  } else {
    delete fields.prNumber;
  }
  return fields;
}

function newestState(planAbs) {
  let best = null;
  let bestMtime = -1;
  if (!fs.existsSync(planAbs)) return null;
  for (const name of fs.readdirSync(planAbs)) {
    if (!name.endsWith('.state.md')) continue;
    const abs = path.join(planAbs, name);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    if (st.mtimeMs >= bestMtime) {
      bestMtime = st.mtimeMs;
      const text = readUtf8(abs);
      best = { name, text, fields: parseState(text) };
    }
  }
  return best;
}

function listArtifacts(planAbs) {
  const names = [];
  try {
    for (const name of fs.readdirSync(planAbs)) names.push(name);
  } catch {
    return { files: [], hasResult: false, hasSpecCopy: false, hasState: false };
  }
  const files = names.filter((n) => {
    try {
      return fs.statSync(path.join(planAbs, n)).isFile();
    } catch {
      return false;
    }
  });
  return {
    files,
    hasResult: files.some((n) => /\.result\.md$/i.test(n)),
    hasSpecCopy: files.some((n) => n.startsWith('step-00-') && n.endsWith('.spec.md')),
    hasState: files.some((n) => n.endsWith('.state.md')),
  };
}

function runGit(repo, args) {
  const r = spawnSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, LC_ALL: 'C' },
  });
  return {
    code: r.status == null ? 1 : r.status,
    out: (r.stdout || '').replace(/\r\n/g, '\n').trim(),
  };
}

function gitHits(repo, relPlan, specRel, slug) {
  const hits = [];
  const seen = new Set();
  const pushLog = (args) => {
    const r = runGit(repo, args);
    if (r.code !== 0 || !r.out) return;
    for (const line of r.out.split('\n')) {
      const tab = line.indexOf('\t');
      const sha = (tab === -1 ? line : line.slice(0, tab)).trim();
      const subject = (tab === -1 ? '' : line.slice(tab + 1)).trim();
      if (!sha || seen.has(sha)) continue;
      seen.add(sha);
      hits.push({ sha, subject });
    }
  };
  const paths = [relPlan];
  if (specRel) paths.push(specRel);
  pushLog(['log', '--all', '-n', '20', '--format=%h\t%s', '--', ...paths]);
  if (slug) pushLog(['log', '--all', '-n', '10', `--grep=${slug}`, '--format=%h\t%s']);
  return hits;
}

function indexHits(indexText, slug) {
  if (!indexText || !slug) {
    return { featureMap: false, nextSpecs: false, doneLog: false, archive: false };
  }
  const needle = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const has = (re) => re.test(indexText);
  return {
    featureMap: has(new RegExp(`spec:\\s*\`?[^\\n]*${needle}`, 'i')) || has(new RegExp(`\\[\\s*[x ~]\\s*\\][^\\n]*${needle}`, 'i')),
    nextSpecs: has(new RegExp(`\\|\\s*\`?${needle}\`?\\s*\\|`, 'i')),
    doneLog: has(new RegExp(`\\|\\s*\`?${needle}\`?\\s*\\|`, 'i')),
    archive: has(new RegExp(`\\|\\s*\`?${needle}\`?\\s*\\|\\s*(shipped|cancelled|failed|archived|in-progress)`, 'i')),
  };
}

function outcomeOf(status, archivedFolder) {
  if (archivedFolder) return 'archived';
  if (status === 'completed') return 'shipped';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'failed') return 'failed';
  if (status === 'active' || status === 'paused') return 'in-progress';
  return 'in-progress';
}

function eligibility(status, archivedFolder, hasState) {
  if (archivedFolder) return { eligible: true, reason: 'archive-folder' };
  if (!hasState) return { eligible: false, reason: 'no-state' };
  if (KEEP_STATUS.has(status)) return { eligible: false, reason: `keep-${status}` };
  if (ELIGIBLE_STATUS.has(status)) return { eligible: true, reason: `status-${status}` };
  return { eligible: false, reason: status ? `keep-${status}` : 'unknown-status' };
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = resolveConsumerContext({
    repoRoot: opts.repoRoot,
    scriptFile: __filename,
    skillId: 'ws-spec-archive',
  });
  const repoRoot = ctx.repoRoot;
  const plansDir = path.resolve(repoRoot, opts.plansDir || '.agents/plans');
  const specsDir = path.resolve(repoRoot, opts.specsDir || '.agents/specs');
  const plansRel = toPosix(path.relative(repoRoot, plansDir)) || '.agents/plans';
  const specsRel = toPosix(path.relative(repoRoot, specsDir)) || '.agents/specs';
  const indexPath = path.join(specsDir, 'index.PRD');
  const indexRel = toPosix(path.relative(repoRoot, indexPath));
  let indexText = '';
  if (fs.existsSync(indexPath)) {
    try {
      indexText = readUtf8(indexPath);
    } catch {
      indexText = '';
    }
  }

  const plans = [];
  const skipped = [];

  if (!fs.existsSync(plansDir)) {
    process.stdout.write(`${JSON.stringify({
      ok: true,
      plansDir: plansRel,
      specsDir: specsRel,
      indexPath: indexRel,
      indexExists: fs.existsSync(indexPath),
      plans: [],
      skipped: [{ path: plansRel, reason: 'plans-dir-missing' }],
    }, null, 2)}\n`);
    return;
  }

  for (const name of fs.readdirSync(plansDir)) {
    if (name === 'index.json') continue;
    const abs = path.join(plansDir, name);
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const slugGuess = name.replace(/\.archive$/i, '');
    if (opts.slug && slugGuess !== opts.slug && name !== opts.slug) continue;

    const relPath = toPosix(path.relative(repoRoot, abs));
    const archivedFolder = /\.archive$/i.test(name) || name.includes('.archive');
    const state = newestState(abs);
    const artifacts = listArtifacts(abs);
    const fields = (state && state.fields) || {};
    const slug = fields.slug || slugGuess;
    const status = fields.status || null;
    const specOfRecordRel = fs.existsSync(path.join(specsDir, `${slug}.spec.md`))
      ? toPosix(path.relative(repoRoot, path.join(specsDir, `${slug}.spec.md`)))
      : (fields.specsPath || null);
    const elig = eligibility(status, archivedFolder, artifacts.hasState);
    const hits = gitHits(repoRoot, relPath, specOfRecordRel, slug);

    plans.push({
      slug,
      relPath,
      archivedFolder,
      status,
      eligible: elig.eligible,
      eligibilityReason: elig.reason,
      outcome: outcomeOf(status, archivedFolder),
      workflowType: fields.workflowType || null,
      currentStep: fields.currentStep != null ? fields.currentStep : null,
      title: fields.title || null,
      prUrl: fields.prUrl && fields.prUrl !== 'null' ? fields.prUrl : null,
      prNumber: fields.prNumber || null,
      branch: fields.branch || null,
      endedAt: fields.endedAt || null,
      shipAction: fields.shipAction || null,
      specOfRecord: specOfRecordRel,
      artifacts,
      gitHits: hits,
      existingIndex: indexHits(indexText, slug),
    });
  }

  const payload = {
    ok: true,
    plansDir: plansRel,
    specsDir: specsRel,
    indexPath: indexRel,
    indexExists: fs.existsSync(indexPath),
    plans,
    skipped,
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err && err.message ? err.message : err}\n`);
  process.exit(1);
}
