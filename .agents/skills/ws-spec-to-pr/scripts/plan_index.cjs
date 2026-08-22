#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { toRepoRelative, resolveConsumerContext } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');

function hash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith('--')) options[token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = argv[++index];
    else positional.push(token);
  }
  return { command: positional[0] || 'build', options };
}

function lineAtByte(buffer, byteOffset) {
  return buffer.subarray(0, byteOffset).toString('utf8').split('\n').length;
}

function sectionIndex(source, sourcePath, repoRoot) {
  const bytes = Buffer.from(source, 'utf8');
  const headingPattern = /^(#{2,4})\s+(.+)$/gm;
  const headings = [];
  for (let match = headingPattern.exec(source); match; match = headingPattern.exec(source)) {
    headings.push({
      level: match[1].length,
      title: match[2].trim(),
      characterStart: match.index,
      byteStart: Buffer.byteLength(source.slice(0, match.index), 'utf8'),
    });
  }
  return headings.map((heading, index) => {
    const next = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    const byteEnd = next ? next.byteStart : bytes.length;
    const slice = bytes.subarray(heading.byteStart, byteEnd);
    const sectionText = slice.toString('utf8');
    const acRefs = [...new Set(sectionText.match(/\bAC[1-9][0-9]*\b/g) || [])].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    const taskIds = [...new Set(sectionText.match(/\bT[0-9]{2}\b/g) || [])].sort();
    const expectedFiles = [...new Set([...sectionText.matchAll(/`((?:\.agents|bin|test|docs|AGENTS|README|FEATURES|CATALOG|package|\.github)[^`\n]+)`/g)].map((item) => item[1]))].sort();
    const expectedTestNames = [...new Set(sectionText.match(/\bV[1-9][0-9]*(?::[a-z0-9-]+)?\b/gi) || [])].sort();
    return {
      id: `section-${String(index + 1).padStart(3, '0')}`,
      title: heading.title,
      level: heading.level,
      byteStart: heading.byteStart,
      byteEnd,
      lineStart: lineAtByte(bytes, heading.byteStart),
      lineEnd: lineAtByte(bytes, byteEnd) - (bytes.subarray(0, byteEnd).toString('utf8').endsWith('\n') ? 1 : 0),
      sha256: hash(slice),
      acRefs,
      taskIds,
      expectedFiles,
      expectedTestNames,
    };
  });
}

function acRows(spec) {
  return [...spec.matchAll(/^- (AC[1-9][0-9]*):\s*(.+)$/gm)].map((match) => ({ id: match[1], text: match[2].trim() }));
}

function build(options) {
  if (!options.plan || !options.spec || !options.output) throw new Error('build requires --plan, --spec, and --output');
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const planPath = path.resolve(context.repoRoot, options.plan);
  const specPath = path.resolve(context.repoRoot, options.spec);
  const raw = fs.readFileSync(planPath);
  const source = raw.toString('utf8');
  const sections = sectionIndex(source, planPath, context.repoRoot);
  const criteria = acRows(fs.readFileSync(specPath, 'utf8')).map((criterion) => {
    const linked = sections.filter((section) => section.acRefs.includes(criterion.id));
    return {
      ...criterion,
      planSectionIds: linked.map((section) => section.id),
      taskIds: [...new Set(linked.flatMap((section) => section.taskIds))].sort(),
      expectedFiles: [...new Set(linked.flatMap((section) => section.expectedFiles))].sort(),
      expectedTestNames: [...new Set(linked.flatMap((section) => section.expectedTestNames))].sort(),
    };
  });
  const missing = criteria.filter((criterion) => !criterion.planSectionIds.length);
  if (missing.length) throw new Error(`plan does not map acceptance criteria: ${missing.map((item) => item.id).join(', ')}`);
  const index = {
    schemaVersion: 1,
    source: {
      path: toRepoRelative(context.repoRoot, planPath),
      sha256: hash(raw),
      bytes: raw.length,
      lines: source.split('\n').length - (source.endsWith('\n') ? 1 : 0),
    },
    ordering: {
      acceptanceCriteria: 'numeric AC id',
      expectedFiles: 'repo-relative POSIX lexicographic',
      expectedTestNames: 'lexicographic',
      sections: 'source byteStart',
      taskIds: 'execution order',
    },
    sections,
    acceptanceCriteria: criteria,
  };
  fs.mkdirSync(path.dirname(path.resolve(context.repoRoot, options.output)), { recursive: true });
  fs.writeFileSync(path.resolve(context.repoRoot, options.output), `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  if (options.draft && fs.existsSync(path.resolve(context.repoRoot, options.draft))) {
    const draftPath = path.resolve(context.repoRoot, options.draft);
    const draft = fs.readFileSync(draftPath, 'utf8').replace(/\r\n?/g, '\n');
    const refined = toRepoRelative(path.dirname(draftPath), planPath);
    const updated = /^---\n/.test(draft)
      ? draft.replace(/^---\n/, `---\nsuperseded: true\nsupersededBy: ${refined}\n`)
      : `---\nsuperseded: true\nsupersededBy: ${refined}\n---\n${draft}`;
    fs.writeFileSync(draftPath, updated, 'utf8');
  }
  return index;
}

function readSlice(options) {
  if (!options.index) throw new Error('read requires --index');
  const context = resolveConsumerContext({ repoRoot: options.repoRoot, scriptFile: __filename });
  const index = JSON.parse(fs.readFileSync(path.resolve(context.repoRoot, options.index), 'utf8'));
  const sourcePath = path.resolve(context.repoRoot, index.source.path);
  const raw = fs.readFileSync(sourcePath);
  if (hash(raw) !== index.source.sha256) {
    throw new Error(`plan source hash mismatch; rebuild with: node ${toRepoRelative(context.repoRoot, __filename)} build --plan ${index.source.path} --spec <spec> --output ${options.index}`);
  }
  let sectionIds = [];
  if (options.section) sectionIds = options.section.split(',');
  if (options.ac) {
    const row = index.acceptanceCriteria.find((item) => item.id === options.ac);
    if (!row) throw new Error(`unknown AC id: ${options.ac}`);
    sectionIds.push(...row.planSectionIds);
  }
  const selected = [...new Set(sectionIds)].map((id) => index.sections.find((section) => section.id === id));
  if (!selected.length || selected.some((item) => !item)) throw new Error('read requires a valid --section or --ac');
  const output = selected.map((section) => {
    const bytes = raw.subarray(section.byteStart, section.byteEnd);
    if (hash(bytes) !== section.sha256) throw new Error(`section hash mismatch: ${section.id}`);
    return bytes.toString('utf8');
  }).join('');
  process.stdout.write(output);
  return output;
}

try {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === 'build') {
    const result = build(options);
    process.stdout.write(`${JSON.stringify({ ok: true, sections: result.sections.length, acceptanceCriteria: result.acceptanceCriteria.length })}\n`);
  } else if (command === 'read') readSlice(options);
  else if (command === 'verify') {
    options.section = JSON.parse(fs.readFileSync(path.resolve(options.repoRoot || '.', options.index), 'utf8')).sections.map((item) => item.id).join(',');
    readSlice(options);
  } else throw new Error(`unknown command: ${command}`);
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
