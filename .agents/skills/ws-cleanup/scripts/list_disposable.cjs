#!/usr/bin/env node
'use strict';

/**
 * List disposable workflow leftovers. Never deletes.
 * Usage:
 *   node list_disposable.cjs --repo-root <root> --plans-dir <rel-or-abs>
 *     [--scratch-only] [--slug <slug>] [--json]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveConsumerContext } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

function parseArgs(argv) {
  const opts = {
    scratchOnly: false,
    json: true,
    slug: null,
    repoRoot: null,
    plansDir: null,
    reviewsDir: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--scratch-only') opts.scratchOnly = true;
    else if (a === '--json') opts.json = true;
    else if (a === '--repo-root') opts.repoRoot = argv[++i];
    else if (a === '--plans-dir') opts.plansDir = argv[++i];
    else if (a === '--reviews-dir') opts.reviewsDir = argv[++i];
    else if (a === '--slug') opts.slug = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function isReviewPrMarkdown(name) {
  return /^PR.+\.md$/i.test(name);
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
    err: (r.stderr || '').replace(/\r\n/g, '\n').trim(),
  };
}

function isTracked(repo, relPosix) {
  const r = runGit(repo, ['ls-files', '--error-unmatch', '--', relPosix]);
  return r.code === 0;
}

function anyTrackedUnder(repo, absDir, repoRoot) {
  const rel = toPosix(path.relative(repoRoot, absDir));
  if (!rel || rel.startsWith('..')) return true;
  const r = runGit(repo, ['ls-files', '--', rel]);
  return r.code === 0 && r.out.length > 0;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function dirSize(abs) {
  let total = 0;
  if (!fs.existsSync(abs)) return 0;
  const st = fs.statSync(abs);
  if (st.isFile()) return st.size;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      let s;
      try {
        s = fs.lstatSync(p);
      } catch {
        continue;
      }
      if (s.isDirectory()) walk(p);
      else if (s.isFile()) total += s.size;
    }
  };
  walk(abs);
  return total;
}

function readStateStatus(planDir) {
  let status = null;
  if (!fs.existsSync(planDir)) return status;
  for (const name of fs.readdirSync(planDir)) {
    if (!name.endsWith('.state.md')) continue;
    const text = fs.readFileSync(path.join(planDir, name), 'utf8');
    const m = text.match(/^status:\s*(\S+)/m);
    if (m) status = m[1].trim().toLowerCase();
  }
  return status;
}

function pushCandidate(list, item) {
  if (list.some((c) => c.path === item.path)) return;
  list.push(item);
}

function isScratchName(name) {
  if (name === 'telemetry' || name === '.runtime') return true;
  if (name.startsWith('.finding-') && name.endsWith('.json')) return true;
  if (name.startsWith('.audit-session-') && name.endsWith('.json')) return true;
  if (/\.baseline$/i.test(name)) return true;
  if (/^step-03-.+\.plan\.exec\.md$/.test(name) || /^step-03-.+\.exec\.dag\.json$/.test(name)) {
    return true;
  }
  if (/^step-00-.+\.issue\.json$/.test(name)) return true;
  if (/^audit-.+\.log\.md$/i.test(name)) return true;
  if (name === 'post-bootstrap-commits.md') return true;
  return false;
}

function scratchReason(name) {
  if (name === 'telemetry') return 'plan telemetry';
  if (name === '.runtime') return 'plan .runtime';
  if (name.startsWith('.finding-')) return 'finding scratch';
  if (name.startsWith('.audit-session-')) return 'audit-session scratch';
  if (/\.baseline$/i.test(name)) return 'baseline snapshot';
  if (/^step-03-/.test(name)) return 'exec dump';
  if (/^step-00-.+\.issue\.json$/.test(name)) return 'issue fetch temp';
  if (/^audit-.+\.log\.md$/i.test(name)) return 'audit log';
  if (name === 'post-bootstrap-commits.md') return 'bootstrap commits scratch';
  return 'plan scratch';
}

function collectScratch(repoRoot, planAbs, plansRelPosix, candidates, skipped) {
  const addPath = (abs, kind, reason) => {
    if (!fs.existsSync(abs)) return;
    const rel = toPosix(path.relative(repoRoot, abs));
    if (!rel || rel.startsWith('..')) {
      skipped.push({ path: rel || abs, reason: 'outside-enclosure' });
      return;
    }
    if (anyTrackedUnder(repoRoot, abs, repoRoot) || (fs.statSync(abs).isFile() && isTracked(repoRoot, rel))) {
      skipped.push({ path: rel, reason: 'tracked' });
      return;
    }
    pushCandidate(candidates, {
      path: rel,
      kind,
      reason,
      bytes: dirSize(abs),
      tracked: false,
    });
  };

  if (!fs.existsSync(planAbs)) return;
  for (const name of fs.readdirSync(planAbs)) {
    if (!isScratchName(name)) continue;
    addPath(path.join(planAbs, name), 'scratch', scratchReason(name));
  }

  void plansRelPosix;
}

/**
 * When a shipped/cancelled/failed plan has some tracked files, list each
 * fully-untracked child (file or dir) so leftovers can still be cleaned.
 */
function collectShippedOrphans(repoRoot, planAbs, candidates, skipped) {
  const walk = (abs) => {
    if (!fs.existsSync(abs)) return;
    let names;
    try {
      names = fs.readdirSync(abs);
    } catch {
      return;
    }
    for (const name of names) {
      const child = path.join(abs, name);
      let st;
      try {
        st = fs.lstatSync(child);
      } catch {
        continue;
      }
      const rel = toPosix(path.relative(repoRoot, child));
      if (!rel || rel.startsWith('..')) {
        skipped.push({ path: rel || child, reason: 'outside-enclosure' });
        continue;
      }
      if (st.isDirectory()) {
        if (anyTrackedUnder(repoRoot, child, repoRoot)) {
          walk(child);
          continue;
        }
        pushCandidate(candidates, {
          path: rel,
          kind: 'shipped-orphan',
          reason: 'untracked under shipped plan',
          bytes: dirSize(child),
          tracked: false,
        });
        continue;
      }
      if (!st.isFile()) continue;
      if (isTracked(repoRoot, rel)) {
        skipped.push({ path: rel, reason: 'tracked' });
        continue;
      }
      pushCandidate(candidates, {
        path: rel,
        kind: 'shipped-orphan',
        reason: 'untracked under shipped plan',
        bytes: dirSize(child),
        tracked: false,
      });
    }
  };
  walk(planAbs);
}

function readGitignore(repoRoot) {
  const p = path.join(repoRoot, '.gitignore');
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

function patternCovered(gitignoreText, pattern) {
  const lines = gitignoreText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  return lines.some((l) => l === pattern || l === pattern.replace(/\/$/, '') || l === `/${pattern}`);
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
  const plansDirRel =
    opts.plansDir ||
    (config.plans && config.plans.dir) ||
    '.agents/plans';
  const reviewsDirRel =
    opts.reviewsDir ||
    (config.reviews && config.reviews.dir) ||
    '.agents/codereviews';
  const plansAbs = path.isAbsolute(plansDirRel)
    ? plansDirRel
    : path.join(repoRoot, plansDirRel);
  const reviewsAbs = path.isAbsolute(reviewsDirRel)
    ? reviewsDirRel
    : path.join(repoRoot, reviewsDirRel);
  const plansPosix = toPosix(path.relative(repoRoot, plansAbs)) || toPosix(plansDirRel);
  const reviewsPosix = toPosix(path.relative(repoRoot, reviewsAbs)) || toPosix(reviewsDirRel);

  const candidates = [];
  const skipped = [];

  if (!fs.existsSync(plansAbs)) {
    skipped.push({ path: plansPosix, reason: 'plans-dir-missing' });
  }

  if (fs.existsSync(plansAbs)) {
    // Cross-plan telemetry aggregate
    const agg = path.join(plansAbs, 'telemetry');
    if (fs.existsSync(agg)) {
      if (anyTrackedUnder(repoRoot, agg, repoRoot)) {
        skipped.push({ path: `${plansPosix}/telemetry`, reason: 'tracked' });
      } else {
        pushCandidate(candidates, {
          path: `${plansPosix}/telemetry`,
          kind: 'scratch',
          reason: 'aggregate telemetry',
          bytes: dirSize(agg),
          tracked: false,
        });
      }
    }

    const entries = fs.readdirSync(plansAbs).filter((n) => {
      if (opts.slug) return n === opts.slug || n === `${opts.slug}.archive`;
      return true;
    });

    for (const name of entries) {
      if (name === 'telemetry') continue;
      const abs = path.join(plansAbs, name);
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (!st.isDirectory()) continue;

      collectScratch(repoRoot, abs, plansPosix, candidates, skipped);

      if (opts.scratchOnly) continue;

      const status = readStateStatus(abs);
      const isArchive = /\.archive$/i.test(name);
      const shipped =
        isArchive || status === 'completed' || status === 'cancelled' || status === 'failed';
      if (!shipped) {
        if (status === 'active' || status === 'paused') {
          skipped.push({
            path: `${plansPosix}/${name}`,
            reason: `active-workflow:${status || 'unknown'}`,
          });
        }
        continue;
      }
      if (anyTrackedUnder(repoRoot, abs, repoRoot)) {
        skipped.push({ path: `${plansPosix}/${name}`, reason: 'tracked-partial' });
        collectShippedOrphans(repoRoot, abs, candidates, skipped);
        continue;
      }
      pushCandidate(candidates, {
        path: `${plansPosix}/${name}`,
        kind: 'shipped-plan',
        reason: isArchive ? 'archive folder' : `status:${status}`,
        bytes: dirSize(abs),
        tracked: false,
      });
    }
  }

  // Local code-review round artifacts: {reviewsDir}/PR*.md
  if (fs.existsSync(reviewsAbs)) {
    for (const name of fs.readdirSync(reviewsAbs)) {
      if (!isReviewPrMarkdown(name)) continue;
      const abs = path.join(reviewsAbs, name);
      let st;
      try {
        st = fs.statSync(abs);
      } catch {
        continue;
      }
      if (!st.isFile()) continue;
      const rel = `${reviewsPosix}/${name}`;
      if (isTracked(repoRoot, rel)) {
        skipped.push({ path: rel, reason: 'tracked' });
        continue;
      }
      pushCandidate(candidates, {
        path: rel,
        kind: 'scratch',
        reason: 'codereview PR*.md',
        bytes: dirSize(abs),
        tracked: false,
      });
    }
  } else {
    skipped.push({ path: reviewsPosix, reason: 'reviews-dir-missing' });
  }

  // Repo-root temps
  for (const name of fs.readdirSync(repoRoot)) {
    if (name.startsWith('.tmp-') || /\.bak_/i.test(name)) {
      const abs = path.join(repoRoot, name);
      if (anyTrackedUnder(repoRoot, abs, repoRoot)) {
        skipped.push({ path: name, reason: 'tracked' });
        continue;
      }
      pushCandidate(candidates, {
        path: name,
        kind: 'temp-root',
        reason: name.startsWith('.tmp-') ? 'tmp dir' : 'bak leftover',
        bytes: dirSize(abs),
        tracked: false,
      });
    }
  }

  // Prefer shipped-plan roots over nested scratch/orphans under the same folder.
  // Prefer parent orphan dirs over nested orphan files.
  const shippedRoots = candidates.filter((c) => c.kind === 'shipped-plan').map((c) => c.path);
  const orphanPaths = candidates
    .filter((c) => c.kind === 'shipped-orphan')
    .map((c) => c.path)
    .sort((a, b) => a.length - b.length);
  const coveredByOrphanParent = (p) =>
    orphanPaths.some((root) => root !== p && (p === root || p.startsWith(`${root}/`)));
  const deduped = candidates.filter((c) => {
    if (c.kind === 'shipped-plan') return true;
    if (shippedRoots.some((root) => c.path === root || c.path.startsWith(`${root}/`))) {
      return false;
    }
    if (c.kind === 'shipped-orphan' && coveredByOrphanParent(c.path)) return false;
    if (c.kind === 'scratch' && coveredByOrphanParent(c.path)) return false;
    return true;
  });

  const gi = readGitignore(repoRoot);
  const suggestPatterns = [
    `${plansPosix}/**/telemetry/`,
    `${plansPosix}/**/.runtime/`,
    `${plansPosix}/**/.finding-*.json`,
    `${plansPosix}/**/.audit-session-*.json`,
    `${plansPosix}/**/audit-*.log.md`,
    `${plansPosix}/**/post-bootstrap-commits.md`,
    `${plansPosix}/**/*.baseline/`,
    `${reviewsPosix}/PR*.md`,
    '.tmp-*/',
    '.tmp-ws-cleanup-approved.json',
  ];
  const gitignoreSuggestions = suggestPatterns.map((pattern) => ({
    pattern,
    reason: 'workflow disposable pattern',
    alreadyIgnored: patternCovered(gi, pattern),
  }));

  const out = {
    ok: true,
    repoRoot,
    plansDir: plansPosix,
    reviewsDir: reviewsPosix,
    scratchOnly: opts.scratchOnly,
    slug: opts.slug,
    candidates: deduped,
    skipped,
    gitignoreSuggestions,
  };
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
}
