#!/usr/bin/env node
'use strict';

/**
 * Write index.PRD Archive (+ missing Done-log rows) and/or delete approved plan dirs.
 * Usage:
 *   node apply_archive.cjs --repo-root <root> --inventory-file <json>
 *     --write-index [--delete-plans] [--slugs-file <json>] --confirm
 *     [--dry-run] [--plans-dir <rel>] [--specs-dir <rel>] [--index-file <rel>]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { resolveConsumerContext } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

const KEEP_STATUS = new Set(['active', 'paused']);
const ARCHIVE_HEADING = /^#{2,}\s+(?:\d+\.\s+)?(?:Delivery archive|Archive)\b.*$/im;
const DONE_HEADING = /^#{2,}\s+(?:\d+\.\s+)?Done log\b.*$/im;

function parseArgs(argv) {
  const opts = {
    confirm: false,
    dryRun: false,
    writeIndex: false,
    deletePlans: false,
    repoRoot: null,
    inventoryFile: null,
    slugsFile: null,
    plansDir: null,
    specsDir: null,
    indexFile: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--confirm') opts.confirm = true;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--write-index') opts.writeIndex = true;
    else if (a === '--delete-plans') opts.deletePlans = true;
    else if (a === '--repo-root') opts.repoRoot = argv[++i];
    else if (a === '--inventory-file') opts.inventoryFile = argv[++i];
    else if (a === '--slugs-file') opts.slugsFile = argv[++i];
    else if (a === '--plans-dir') opts.plansDir = argv[++i];
    else if (a === '--specs-dir') opts.specsDir = argv[++i];
    else if (a === '--index-file') opts.indexFile = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.writeIndex && !opts.deletePlans) {
    throw new Error('need --write-index and/or --delete-plans');
  }
  if (!opts.inventoryFile) throw new Error('--inventory-file is required');
  if (!opts.dryRun && !opts.confirm) throw new Error('refusing to write without --confirm (or pass --dry-run)');
  return opts;
}

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function readUtf8(abs) {
  return fs.readFileSync(abs, 'utf8').replace(/^\uFEFF/, '');
}

function loadJson(file) {
  return JSON.parse(readUtf8(file));
}

function loadSlugs(file) {
  if (!file) return null;
  const raw = loadJson(file);
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && Array.isArray(raw.slugs)) return raw.slugs.map(String);
  throw new Error('slugs-file must be a JSON array or { "slugs": [...] }');
}

function cell(value) {
  const s = value == null || value === '' ? '—' : String(value);
  return s.replace(/\|/g, '/').replace(/\r?\n/g, ' ').trim() || '—';
}

function prCommit(plan) {
  if (plan.prDisplay) return cell(plan.prDisplay);
  const parts = [];
  if (plan.prUrl && plan.prNumber) parts.push(`[PR #${plan.prNumber}](${plan.prUrl})`);
  else if (plan.prUrl) parts.push(`[PR](${plan.prUrl})`);
  else if (plan.prNumber) parts.push(`PR #${plan.prNumber}`);
  const sha = plan.commitSha || (plan.gitHits && plan.gitHits[0] && plan.gitHits[0].sha);
  if (sha) parts.push(`\`${sha}\``);
  return parts.length ? parts.join(' ') : '—';
}

function lastState(plan) {
  if (plan.lastState) return cell(plan.lastState);
  const status = plan.status || '—';
  const step = plan.currentStep != null ? `step ${plan.currentStep}` : null;
  return step ? `${status} / ${step}` : String(status);
}

function summaryOf(plan) {
  if (plan.summary) return cell(plan.summary);
  if (plan.title) return cell(plan.title);
  return '—';
}

function endedDate(plan) {
  const raw = plan.endedAt || plan.date;
  if (raw && /^\d{4}-\d{2}-\d{2}/.test(String(raw))) return String(raw).slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function sectionRange(md, headingRe) {
  const m = md.match(headingRe);
  if (!m || m.index == null) return null;
  const start = m.index;
  const after = start + m[0].length;
  const rest = md.slice(after);
  const next = rest.search(/\n#{2,}\s+/);
  const end = next === -1 ? md.length : after + next + 1;
  return { start, headingEnd: after, end, heading: m[0] };
}

function tableHasSlug(body, slug) {
  const needle = slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\|\\s*\`?${needle}\`?\\s*\\|`).test(body);
}

function upsertArchive(md, plans) {
  const header = [
    '## Archive',
    '',
    'Durable delivery records harvested from plan folders so `{plansDir}` can be cleaned without losing history.',
    '',
    '| Slug | Outcome | Last state | PR / Commit | Summary |',
    '|------|---------|------------|-------------|---------|',
  ].join('\n');

  let doc = md;
  let range = sectionRange(doc, ARCHIVE_HEADING);
  if (!range) {
    const insertAt = (() => {
      const maint = doc.search(/^#{2,}\s+(?:\d+\.\s+)?Maintenance\b/im);
      if (maint !== -1) return maint;
      const related = doc.search(/^#{2,}\s+(?:\d+\.\s+)?Related docs\b/im);
      if (related !== -1) return related;
      return doc.length;
    })();
    const prefix = doc.slice(0, insertAt).replace(/\s*$/, '\n\n');
    const suffix = doc.slice(insertAt);
    doc = `${prefix}${header}\n${suffix.startsWith('\n') ? '' : '\n'}${suffix}`;
    range = sectionRange(doc, ARCHIVE_HEADING);
  }

  const body = doc.slice(range.headingEnd, range.end);
  const lines = body.split('\n');
  const outLines = lines.slice();
  const written = [];
  for (const plan of plans) {
    const row = `| \`${plan.slug}\` | ${cell(plan.outcome || 'in-progress')} | ${lastState(plan)} | ${prCommit(plan)} | ${summaryOf(plan)} |`;
    const re = new RegExp(`^\\|\\s*\`?${plan.slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\`?\\s*\\|`);
    const idx = outLines.findIndex((ln) => re.test(ln.trim()));
    if (idx >= 0) outLines[idx] = row;
    else outLines.push(row);
    written.push(plan.slug);
  }
  const newBody = `${outLines.join('\n').replace(/^\n/, '')}`.replace(/\s*$/, '\n');
  return {
    md: `${doc.slice(0, range.headingEnd)}${newBody.startsWith('\n') ? '' : '\n'}${newBody}${doc.slice(range.end)}`,
    written,
  };
}

function appendDoneLog(md, plans) {
  const shipped = plans.filter((p) => (p.outcome || '') === 'shipped');
  if (!shipped.length) return { md, appended: [] };
  let range = sectionRange(md, DONE_HEADING);
  const appended = [];
  if (!range) {
    const block = [
      '## Done log',
      '',
      '| Date | Slug | Title | PR / Commit |',
      '|------|------|-------|-------------|',
      '',
    ].join('\n');
    md = `${md.replace(/\s*$/, '\n\n')}${block}\n`;
    range = sectionRange(md, DONE_HEADING);
  }
  const body = md.slice(range.headingEnd, range.end);
  let extra = '';
  for (const plan of shipped) {
    if (tableHasSlug(body + extra, plan.slug)) continue;
    extra += `| ${endedDate(plan)} | \`${plan.slug}\` | ${cell(plan.title || plan.slug)} | ${prCommit(plan)} |\n`;
    appended.push(plan.slug);
  }
  if (!extra) return { md, appended };
  const insertAt = range.end;
  return { md: `${md.slice(0, insertAt)}${extra}${md.slice(insertAt)}`, appended };
}

function seedIndex(title) {
  return [
    `# ${title} — Specification Index`,
    '',
    '## 1. How to use',
    '',
    '- **Index (this file):** High-level roadmap, phase feature map, next specs, done log, archive.',
    '- **Detail specs (`*.spec.md`):** Deep requirements and acceptance criteria under `{specsDir}/`.',
    '',
    '## 10. Done log',
    '',
    '| Date | Slug | Title | PR / Commit |',
    '|------|------|-------|-------------|',
    '',
    '## Archive',
    '',
    'Durable delivery records harvested from plan folders so `{plansDir}` can be cleaned without losing history.',
    '',
    '| Slug | Outcome | Last state | PR / Commit | Summary |',
    '|------|---------|------------|-------------|---------|',
    '',
  ].join('\n');
}

function inside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
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

function prunePlansIndex(abs, removeSlugs) {
  if (!fs.existsSync(abs)) return false;
  let data;
  try {
    data = JSON.parse(readUtf8(abs));
  } catch {
    return false;
  }
  if (!data || !Array.isArray(data.workflows)) return false;
  const next = data.workflows.filter((w) => !removeSlugs.has(w.slug));
  if (next.length === data.workflows.length) return false;
  data.workflows = next;
  data.revision = (data.revision || 0) + 1;
  data.generatedAt = new Date().toISOString();
  fs.writeFileSync(abs, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return true;
}

function rmDir(abs) {
  fs.rmSync(abs, { recursive: true, force: true });
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const ctx = resolveConsumerContext({
    repoRoot: opts.repoRoot,
    scriptFile: __filename,
    skillId: 'ws-spec-archive',
  });
  const repoRoot = ctx.repoRoot;
  const inventory = loadJson(opts.inventoryFile);
  if (!inventory || !Array.isArray(inventory.plans)) {
    throw new Error('inventory-file must contain { "plans": [...] }');
  }
  const plansDir = path.resolve(repoRoot, opts.plansDir || inventory.plansDir || '.agents/plans');
  const specsDir = path.resolve(repoRoot, opts.specsDir || inventory.specsDir || '.agents/specs');
  const indexAbs = path.resolve(
    repoRoot,
    opts.indexFile || inventory.indexPath || path.join(path.relative(repoRoot, specsDir), 'index.PRD'),
  );
  const approved = loadSlugs(opts.slugsFile);

  const written = [];
  const appended = [];
  const deleted = [];
  const skipped = [];
  const filesForCommit = [];

  if (opts.writeIndex) {
    const rows = inventory.plans.filter((p) => p && p.slug);
    let md = fs.existsSync(indexAbs) ? readUtf8(indexAbs) : seedIndex('Project');
    const up = upsertArchive(md, rows);
    md = up.md;
    written.push(...up.written);
    const done = appendDoneLog(md, rows);
    md = done.md;
    appended.push(...done.appended);
    const indexRel = toPosix(path.relative(repoRoot, indexAbs));
    filesForCommit.push(indexRel);
    if (!opts.dryRun) {
      fs.mkdirSync(path.dirname(indexAbs), { recursive: true });
      fs.writeFileSync(indexAbs, md.replace(/\s*$/, '\n'), 'utf8');
    }
  }

  if (opts.deletePlans) {
    const removeSlugs = new Set();
    for (const plan of inventory.plans) {
      if (!plan || !plan.slug) continue;
      if (approved && !approved.includes(plan.slug)) {
        skipped.push({ slug: plan.slug, reason: 'not-approved' });
        continue;
      }
      if (!plan.eligible) {
        skipped.push({ slug: plan.slug, reason: plan.eligibilityReason || 'not-eligible' });
        continue;
      }
      if (KEEP_STATUS.has(plan.status)) {
        skipped.push({ slug: plan.slug, reason: `keep-${plan.status}` });
        continue;
      }
      const abs = path.resolve(repoRoot, plan.relPath || path.join(plansDir, plan.slug));
      if (!inside(abs, plansDir)) {
        skipped.push({ slug: plan.slug, reason: 'outside-plans-dir' });
        continue;
      }
      const tracked = runGit(repoRoot, ['ls-files', '--', toPosix(path.relative(repoRoot, abs))]);
      if (tracked.code === 0 && tracked.out.length > 0) {
        skipped.push({ slug: plan.slug, reason: 'tracked-partial' });
        continue;
      }
      if (!fs.existsSync(abs)) {
        skipped.push({ slug: plan.slug, reason: 'missing' });
        continue;
      }
      const rel = toPosix(path.relative(repoRoot, abs));
      deleted.push(rel);
      removeSlugs.add(plan.slug);
      filesForCommit.push(rel);
      if (!opts.dryRun) rmDir(abs);
    }
    const plansIndexAbs = path.join(plansDir, 'index.json');
    if (removeSlugs.size && fs.existsSync(plansIndexAbs)) {
      const rel = toPosix(path.relative(repoRoot, plansIndexAbs));
      filesForCommit.push(rel);
      if (!opts.dryRun) prunePlansIndex(plansIndexAbs, removeSlugs);
    }
  }

  const uniqueFiles = [...new Set(filesForCommit)];
  const payload = {
    ok: true,
    dryRun: Boolean(opts.dryRun),
    written,
    doneLogAppended: appended,
    deleted,
    skipped,
    proposedCommit: {
      files: uniqueFiles,
      message: 'Archive shipped plan history into index.PRD and remove completed plan dirs.',
    },
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

try {
  main();
} catch (err) {
  process.stderr.write(`${err && err.message ? err.message : err}\n`);
  process.exit(1);
}
