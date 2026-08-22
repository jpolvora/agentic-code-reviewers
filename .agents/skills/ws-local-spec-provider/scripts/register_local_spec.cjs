#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  resolveConsumerContext,
  resolveConfiguredPath,
  toRepoRelative,
} = require('../../ws-shared/scripts/resolve_consumer_root.cjs');
const {
  parseFrontmatter,
  upsertArtifactFrontmatter,
  artifactStampFields,
} = require('../../ws-shared/scripts/workflow_state.cjs');

function argsOf(argv) {
  const args = { source: 'local', force: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--force') args.force = true;
    else if (token === '--json') args.json = true;
    else if (token.startsWith('--')) args[token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++i];
  }
  if (!args.input) throw new Error('--input is required');
  return args;
}

function scalar(frontmatter, key) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, 'mi'));
  return match ? match[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

function inferSlug(file, text) {
  const frontmatter = text.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] || '';
  const configured = scalar(frontmatter, 'slug');
  if (configured) return configured;
  const name = path.basename(file);
  const stem = name.endsWith('.spec.md') ? name.slice(0, -8) : path.parse(name).name;
  if (/^(readme|index|spec)$/i.test(stem)) return path.basename(path.dirname(file));
  return stem.replace(/^step-00-/, '');
}

function normalize(text, slug, source) {
  const lf = text.replace(/\r\n?/g, '\n').replace(/\s*$/, '\n');
  const match = lf.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  const title = match ? scalar(match[1], 'title') : '';
  const body = match ? lf.slice(match[0].length) : lf;
  const original = match ? match[1].split('\n') : [];
  const values = new Map();
  for (const line of original) {
    const item = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (item) values.set(item[1], item[2]);
  }
  values.set('id', values.get('id') || 'null');
  values.set('slug', slug);
  values.set('title', title ? `"${title.replace(/"/g, "'")}"` : `"${slug.replace(/-/g, ' ')}"`);
  values.set('source', source);
  values.set('specDate', values.get('specDate') || new Date().toISOString().slice(0, 10));
  const ordered = ['id', 'slug', 'title', 'source', 'specDate'];
  const extras = [...values.keys()].filter((key) => !ordered.includes(key));
  const fm = [...ordered, ...extras].map((key) => `${key}: ${values.get(key)}`).join('\n');
  return `---\n${fm}\n---\n\n${body.replace(/^\s+/, '')}`;
}

function resolveInput(raw, root, specsDir) {
  const direct = path.resolve(raw);
  const rooted = path.resolve(root, raw);
  for (const candidate of [direct, rooted]) if (fs.existsSync(candidate)) return candidate;
  const slug = path.basename(raw).replace(/\.spec\.md$/, '').replace(/^step-00-/, '');
  const candidates = [
    path.join(specsDir, `${slug}.spec.md`),
    path.join(specsDir, slug, 'README.spec.md'),
    path.join(specsDir, slug, `${slug}.spec.md`),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`input not found: ${raw}`);
  return found;
}

function writeChecked(file, content, force) {
  if (fs.existsSync(file)) {
    const current = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
    if (current !== content && !force) throw new Error(`destination exists and differs: ${file}`);
    if (current === content) return 'unchanged';
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
  return fs.existsSync(file) ? 'written' : 'overwritten';
}

function main() {
  const args = argsOf(process.argv.slice(2));
  const context = resolveConsumerContext({ repoRoot: args.repoRoot, scriptFile: __filename });
  const config = context.config || {};
  const plansDir = resolveConfiguredPath(context.repoRoot, args.plansDir || config.plans?.dir, '.agents/plans');
  const specsDir = resolveConfiguredPath(context.repoRoot, args.specsDir || config.plans?.specsDir, '.agents/specs');
  const input = resolveInput(args.input, context.repoRoot, specsDir);
  const raw = fs.readFileSync(input, 'utf8');
  const slug = args.slug || inferSlug(input, raw);
  const content = normalize(raw, slug, args.source);
  const inSpecs = path.relative(specsDir, input) === '' || !path.relative(specsDir, input).startsWith('..');
  const specPath = inSpecs ? input : path.join(specsDir, `${slug}.spec.md`);
  const workflowPath = path.join(plansDir, slug, `step-00-${slug}.spec.md`);
  const usDir = path.dirname(workflowPath);
  const now = new Date().toISOString();
  let state = { slug, workflowId: slug, status: 'active', acRefs: [] };
  const stateHit = fs.existsSync(usDir)
    ? fs.readdirSync(usDir).find((name) => name.endsWith('.state.md'))
    : null;
  if (stateHit) {
    try {
      state = { ...state, ...parseFrontmatter(fs.readFileSync(path.join(usDir, stateHit), 'utf8')).data };
    } catch {
      // keep slug fallback
    }
  }
  const fields = artifactStampFields(state, 0, now);
  if (fs.existsSync(workflowPath)) {
    try {
      const previous = parseFrontmatter(fs.readFileSync(workflowPath, 'utf8')).data;
      if (previous.startedAt) fields.startedAt = previous.startedAt;
      if (previous.endedAt) fields.endedAt = previous.endedAt;
    } catch {
      // first stamp of a spec-only copy
    }
  }
  const workflowContent = upsertArtifactFrontmatter(content, fields);

  for (const [target, force, expected] of [
    [specPath, args.force || inSpecs, content],
    [workflowPath, args.force || input === workflowPath, workflowContent],
  ]) {
    if (fs.existsSync(target) && fs.readFileSync(target, 'utf8').replace(/\r\n?/g, '\n') !== expected && !force) {
      throw new Error(`destination exists and differs: ${target}`);
    }
  }
  const specsAction = writeChecked(specPath, content, args.force || inSpecs);
  const action = writeChecked(workflowPath, workflowContent, args.force || input === workflowPath);
  const payload = {
    input: toRepoRelative(context.repoRoot, input),
    slug,
    specsPath: toRepoRelative(context.repoRoot, specPath),
    specsAction,
    specPath: toRepoRelative(context.repoRoot, workflowPath),
    usDir: toRepoRelative(context.repoRoot, path.dirname(workflowPath)),
    source: args.source,
    action,
  };
  process.stdout.write(args.json ? `${JSON.stringify(payload, null, 2)}\n` : Object.entries(payload).map(([k, v]) => `${k}: ${v}`).join('\n') + '\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
