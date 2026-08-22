#!/usr/bin/env node
'use strict';

/**
 * Delete approved disposable paths after user confirm.
 * Usage:
 *   node apply_cleanup.cjs --repo-root <root> --confirm --paths-file <json>
 *
 * paths-file JSON: { "paths": ["relative/posix", ...] } or a bare string array.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveConsumerContext, inside } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

function parseArgs(argv) {
  const opts = { confirm: false, repoRoot: null, pathsFile: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--confirm') opts.confirm = true;
    else if (a === '--repo-root') opts.repoRoot = argv[++i];
    else if (a === '--paths-file') opts.pathsFile = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.confirm) throw new Error('refusing to delete without --confirm');
  if (!opts.pathsFile) throw new Error('--paths-file is required');
  return opts;
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

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function anyTrackedUnder(repo, absPath, repoRoot) {
  const rel = toPosix(path.relative(repoRoot, absPath));
  if (!rel || rel.startsWith('..')) return true;
  const r = runGit(repo, ['ls-files', '--', rel]);
  return r.code === 0 && r.out.length > 0;
}

function loadPaths(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.paths)) return raw.paths;
  throw new Error('paths-file must be a JSON array or { "paths": [...] }');
}

function isAllowedEnclosure(relPosix, repoRoot, plansDirPosix, reviewsDirPosix) {
  if (!relPosix || path.isAbsolute(relPosix)) return false;
  const abs = path.resolve(repoRoot, relPosix);
  if (!inside(abs, repoRoot)) return false;
  const normalized = toPosix(path.relative(repoRoot, abs));
  if (!normalized || normalized.startsWith('..')) return false;
  const first = normalized.split('/')[0];
  if (first.startsWith('.tmp-') || /\.bak_/i.test(first)) return true;
  if (plansDirPosix && normalized === `${plansDirPosix}/index.json`) return false;
  if (plansDirPosix && (normalized === plansDirPosix || normalized.startsWith(`${plansDirPosix}/`))) {
    return true;
  }
  if (reviewsDirPosix && normalized.startsWith(`${reviewsDirPosix}/`)) {
    const base = normalized.slice(reviewsDirPosix.length + 1);
    return /^PR.+\.md$/i.test(base) && !base.includes('/');
  }
  return false;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = resolveConsumerContext({
    repoRoot: opts.repoRoot,
    scriptFile: __filename,
    skillId: 'ws-cleanup',
  });
  const repoRoot = ctx.repoRoot;
  const config = ctx.config || {};
  const plansDirRel = (config.plans && config.plans.dir) || '.agents/plans';
  const reviewsDirRel = (config.reviews && config.reviews.dir) || '.agents/codereviews';
  const plansAbs = path.isAbsolute(plansDirRel)
    ? plansDirRel
    : path.join(repoRoot, plansDirRel);
  const reviewsAbs = path.isAbsolute(reviewsDirRel)
    ? reviewsDirRel
    : path.join(repoRoot, reviewsDirRel);
  const plansPosix = toPosix(path.relative(repoRoot, plansAbs)) || toPosix(plansDirRel);
  const reviewsPosix = toPosix(path.relative(repoRoot, reviewsAbs)) || toPosix(reviewsDirRel);

  const paths = loadPaths(opts.pathsFile);
  const deleted = [];
  const skipped = [];

  for (const relRaw of paths) {
    const rel = toPosix(String(relRaw).replace(/\\/g, '/'));
    if (!isAllowedEnclosure(rel, repoRoot, plansPosix, reviewsPosix)) {
      skipped.push({ path: rel, reason: 'outside-enclosure' });
      continue;
    }
    const abs = path.resolve(repoRoot, rel);
    const normalized = toPosix(path.relative(repoRoot, abs));
    if (normalized.startsWith('.agents/skills')) {
      skipped.push({ path: rel, reason: 'skill-body' });
      continue;
    }
    if (
      normalized.startsWith('src/') ||
      normalized.startsWith('bin/') ||
      normalized.startsWith('test/') ||
      normalized.startsWith('docs/')
    ) {
      skipped.push({ path: rel, reason: 'product-tree' });
      continue;
    }
    if (!fs.existsSync(abs)) {
      skipped.push({ path: rel, reason: 'missing' });
      continue;
    }
    if (anyTrackedUnder(repoRoot, abs, repoRoot)) {
      skipped.push({ path: rel, reason: 'tracked' });
      continue;
    }
    try {
      fs.rmSync(abs, { recursive: true, force: true });
      deleted.push(rel);
    } catch (err) {
      skipped.push({ path: rel, reason: `error:${err.message}` });
    }
  }

  const out = { ok: true, deleted, skipped };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  if (skipped.some((s) => s.reason.startsWith('error:'))) process.exit(2);
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
}
