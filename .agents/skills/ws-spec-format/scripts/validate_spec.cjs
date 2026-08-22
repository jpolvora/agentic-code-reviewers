#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const options = { json: false, modification: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json' || token === '--modification') options[token.slice(2)] = true;
    else if (token === '--repo-root') options.repoRoot = argv[++index];
    else if (!options.spec) options.spec = token;
    else throw new Error(`unknown argument: ${token}`);
  }
  if (!options.spec) throw new Error('spec path is required');
  return options;
}

function frontmatter(text) {
  const match = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (!match) return null;
  const values = {};
  for (const line of match[1].split('\n')) {
    const item = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (item) values[item[1]] = item[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return values;
}

function compositeReason(text) {
  if ((text.match(/\*\*[^*]+\*\*/g) || []).length > 1) return 'more than one bolded component';
  if (text.trim().split(/\s+/).length > 60) return 'more than 60 words';
  const joinedImperatives = text.match(/\b(?:and|or)\s+(?:add|assert|build|check|create|emit|enforce|ensure|fail|implement|include|keep|make|persist|publish|record|reject|remove|render|report|require|run|search|store|support|update|validate|verify|write)\b/gi) || [];
  const openingImperative = /^(?:add|assert|build|check|create|emit|enforce|ensure|fail|implement|include|keep|make|persist|publish|record|reject|remove|render|report|require|run|search|store|support|update|validate|verify|write)\b/i.test(text.trim());
  if (openingImperative && joinedImperatives.length > 1) return 'more than one conjunction-joined imperative';
  return '';
}

function validate(text, options) {
  const errors = [];
  const warnings = [];
  const fm = frontmatter(text);
  if (!fm) errors.push({ code: 'frontmatter-missing', message: 'Required YAML frontmatter is missing.' });
  else {
    for (const key of ['id', 'slug', 'title', 'source', 'specDate']) {
      if (!(key in fm) || fm[key] === '') errors.push({ code: 'frontmatter-key', message: `Frontmatter key is required: ${key}` });
    }
    if (!['local', 'github', 'azure-devops'].includes(fm.source)) errors.push({ code: 'source', message: 'source must be local, github, or azure-devops.' });
    if (['github', 'azure-devops'].includes(fm.source) && !/^### Prior Work Sweep\s*$/m.test(text)) {
      errors.push({ code: 'prior-work', message: 'Tracker specifications require ### Prior Work Sweep.' });
    }
  }
  for (const heading of ['## Description', '## Acceptance Criteria']) {
    if (!text.includes(heading)) errors.push({ code: 'section', message: `Required section is missing: ${heading}` });
  }
  const rows = [...text.matchAll(/^- (AC([1-9][0-9]*)):\s*(.+)$/gm)];
  if (!rows.length) errors.push({ code: 'acceptance-criteria', message: 'At least one one-line acceptance criterion is required.' });
  rows.forEach((row, index) => {
    const expected = index + 1;
    if (Number(row[2]) !== expected) errors.push({ code: 'ac-sequence', ac: row[1], message: `Expected AC${expected}, found ${row[1]}.` });
    const reason = compositeReason(row[3]);
    if (reason) errors.push({ code: 'composite-ac', ac: row[1], message: `${row[1]} is composite: ${reason}.` });
  });
  const description = text.match(/## Description\s*\n([\s\S]*?)(?=\n## )/)?.[1] || '';
  const modification = options.modification || /\b(?:modify|modification|bug\s*fix|bugfix|existing\s+(?:feature|workflow|behavior)|refactor|upgrade)\b/i.test(description);
  if (modification && !/^### Design Intent\s*$/m.test(text)) errors.push({ code: 'design-intent', message: 'Modification specifications require ### Design Intent.' });
  return { ok: errors.length === 0, errors, warnings, acceptanceCriteria: rows.map((row) => row[1]) };
}

try {
  const options = parseArgs(process.argv.slice(2));
  const file = path.resolve(options.repoRoot || '.', options.spec);
  const result = validate(fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n'), options);
  if (options.json) process.stdout.write(`${JSON.stringify({ file: options.spec.replace(/\\/g, '/'), ...result }, null, 2)}\n`);
  else {
    for (const error of result.errors) process.stderr.write(`${error.ac ? `${error.ac}: ` : ''}${error.message}\n`);
    if (result.ok) process.stdout.write(`PASS: ${options.spec} (${result.acceptanceCriteria.length} ACs)\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  process.stderr.write(`ERROR: ${error.message}\n`);
  process.exitCode = 1;
}
