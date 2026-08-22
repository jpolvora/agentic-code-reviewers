#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { resolveConsumerContext, toRepoRelative } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');
const {
  parseFrontmatter,
  upsertArtifactFrontmatter,
  artifactStampFields,
} = require('../../ws-shared/scripts/workflow_state.cjs');

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error(`unknown argument: ${token}`);
    options[token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++index];
  }
  for (const key of ['input', 'outputDir', 'slug', 'round']) if (!options[key]) throw new Error(`--${key} is required`);
  return options;
}

function parseFindings(content) {
  const findings = [];
  const expression = /^###\s+(CR-[0-9]{3,})\s+\[(Critical|Warning|Suggestion)\]\s+(open|closed)\s+(.+):L([1-9][0-9]*)-L([1-9][0-9]*)\s*$/gm;
  for (const match of content.matchAll(expression)) {
    const finding = {
      id: match[1],
      severity: match[2],
      state: match[3],
      path: match[4].replace(/\\/g, '/'),
      lineStart: Number(match[5]),
      lineEnd: Number(match[6]),
    };
    if (finding.lineEnd < finding.lineStart) throw new Error(`${finding.id}: invalid evidence range`);
    if (findings.some((item) => item.id === finding.id)) throw new Error(`${finding.id}: duplicate finding id`);
    findings.push(finding);
  }
  if (!findings.length && !/\bNo feedback\b/.test(content)) {
    throw new Error('review input must contain finding headings or "No feedback"');
  }
  for (const finding of findings) {
    const bodyStart = content.indexOf(`### ${finding.id}`);
    const bodyEnd = content.indexOf('\n### ', bodyStart + 1);
    const body = content.slice(bodyStart, bodyEnd < 0 ? content.length : bodyEnd);
    if (/\b(?:ineffective|weakened)\s+(?:assertion|test|gate|check)\b/i.test(body) && finding.severity === 'Suggestion') {
      throw new Error(`${finding.id}: ineffective checks are minimum Warning`);
    }
  }
  return findings;
}

function priorFindings(outputDir, slug, round) {
  const known = new Map();
  for (let current = 1; current < round; current += 1) {
    const file = path.join(outputDir, `step-06-${slug}.review.r${current}.md`);
    if (!fs.existsSync(file)) continue;
    for (const finding of parseFindings(fs.readFileSync(file, 'utf8'))) known.set(finding.id, { ...finding, round: current });
  }
  return known;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const round = Number(options.round);
  if (!Number.isInteger(round) || round < 1) throw new Error('--round must be a positive integer');
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const input = path.resolve(context.repoRoot, options.input);
  const outputDir = path.resolve(context.repoRoot, options.outputDir);
  const content = fs.readFileSync(input, 'utf8').replace(/\r\n?/g, '\n').replace(/\s*$/, '\n');
  const findings = parseFindings(content);
  const known = priorFindings(outputDir, options.slug, round);
  for (const finding of findings) {
    const previous = known.get(finding.id);
    if (finding.state === 'closed' && (!previous || previous.state !== 'open')) {
      throw new Error(`${finding.id}: closure requires the same id open in an earlier round`);
    }
  }
  const roundFile = path.join(outputDir, `step-06-${options.slug}.review.r${round}.md`);
  const canonical = path.join(outputDir, `step-06-${options.slug}.review.md`);
  const now = new Date().toISOString();
  let state = { slug: options.slug, workflowId: options.workflowId || options.slug, status: 'completed', acRefs: [] };
  const stateHit = fs.existsSync(outputDir)
    ? fs.readdirSync(outputDir).find((name) => name.endsWith('.state.md'))
    : null;
  if (stateHit) {
    try {
      state = { ...state, ...parseFrontmatter(fs.readFileSync(path.join(outputDir, stateHit), 'utf8')).data };
    } catch {
      // keep fallback identity from slug
    }
  }
  const fields = artifactStampFields(state, 6, now);
  if (fs.existsSync(roundFile)) {
    try {
      const previous = parseFrontmatter(fs.readFileSync(roundFile, 'utf8')).data;
      if (previous.startedAt) fields.startedAt = previous.startedAt;
      if (previous.endedAt) fields.endedAt = previous.endedAt;
    } catch {
      // first persist of a body-only round
    }
  }
  const stamped = upsertArtifactFrontmatter(content, fields);
  if (fs.existsSync(roundFile) && fs.readFileSync(roundFile, 'utf8') !== stamped) {
    throw new Error(`review round is immutable and already differs: ${toRepoRelative(context.repoRoot, roundFile)}`);
  }
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(roundFile, stamped, 'utf8');
  fs.writeFileSync(canonical, stamped, 'utf8');
  process.stdout.write(`${JSON.stringify({
    ok: true,
    round,
    findings,
    roundPath: toRepoRelative(context.repoRoot, roundFile),
    canonicalPath: toRepoRelative(context.repoRoot, canonical),
  })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
