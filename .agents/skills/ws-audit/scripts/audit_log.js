#!/usr/bin/env node
/**
 * ws-audit — runtime audit log helper for ws-spec-to-pr* orchestrators.
 * CLI: node audit_log.js <command> [options]
 * Commands: init | append | finalize | has-errors | has-suggestions | draft-issue | draft-suggestions-issue | resolve
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const { resolveConsumerContext, toRepoRelative } = require('../../ws-shared/scripts/resolve_consumer_root.cjs');
const { syncAcCountsFromLedger } = require('../../ws-shared/scripts/ac_counts.cjs');

const VALID_CATEGORIES = new Set([
  'script',
  'tool',
  'io-validation',
  'dispatch',
  'disposable-script',
  'performance',
  'correctness',
  'optimization',
  'other',
]);
const VALID_SEVERITIES = new Set([
  'error',
  'unusual',
  'suggestion',
  'opportunity',
  'info',
]);

function usage() {
  console.log(`Usage:
  node audit_log.js resolve [--config <path>]
  node audit_log.js init --us-dir <path> --slug <slug> [--workflow-id <id>]
  node audit_log.js append (--session <json>|--session-file <path>) (--finding <json>|--finding-file <path>)
  node audit_log.js finalize (--session <json>|--session-file <path>)
  node audit_log.js has-errors (--session <json>|--session-file <path>)
  node audit_log.js has-suggestions (--session <json>|--session-file <path>)
  node audit_log.js draft-issue (--session <json>|--session-file <path>) [--type error|suggestion|all] [--upstream <owner/repo>]
  node audit_log.js draft-suggestions-issue (--session <json>|--session-file <path>) [--upstream <owner/repo>]`);
}

function readJsonArg(raw, label) {
  if (!raw) {
    console.error(`Error: --${label} required`);
    process.exit(2);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error: invalid --${label} JSON: ${e.message}`);
    process.exit(2);
  }
}

function readJsonFile(filePath, label) {
  if (!filePath) {
    console.error(`Error: --${label} required`);
    process.exit(2);
  }
  try {
    const raw = fs.readFileSync(path.resolve(filePath), 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Error: invalid --${label} file: ${e.message}`);
    process.exit(2);
  }
}

function resolveConfigPath(explicit) {
  if (explicit) return resolveMaybeRelative(explicit);
  return resolveConsumerContext({ repoRoot: repoRoot(), scriptFile: __filename }).configPath;
}

function resolveUpstreamRepo() {
  const candidates = [
    path.resolve(process.cwd(), 'bin/skill-dependencies.json'),
    path.resolve(process.cwd(), '.agents/skills/ws-shared/skill-dependencies.json'),
    path.resolve(__dirname, '../../ws-shared/skill-dependencies.json'),
  ];
  for (const cand of candidates) {
    try {
      if (!fs.existsSync(cand)) continue;
      const data = JSON.parse(fs.readFileSync(cand, 'utf-8'));
      const repo = data?.upstream?.repo;
      if (repo && typeof repo === 'string' && repo.includes('/')) return repo;
    } catch {
      /* try next */
    }
  }
  return 'jpolvora/workflow-skills';
}

export function resolveEnableAuditing(configPath) {
  const p = resolveConfigPath(configPath);
  if (!fs.existsSync(p)) return false;
  try {
    const raw = fs.readFileSync(p, 'utf-8');
    const cfg = JSON.parse(raw);
    return cfg?.defaults?.enableAuditing === true;
  } catch {
    return false;
  }
}

function isoNow() {
  return new Date().toISOString();
}

function repoRoot() {
  return resolveConsumerContext({ scriptFile: __filename }).repoRoot;
}

function toPosixRelative(p) {
  return toRepoRelative(repoRoot(), path.resolve(p));
}

function resolveMaybeRelative(p) {
  if (!p || typeof p !== 'string') return p;
  if (path.isAbsolute(p)) return path.resolve(p);
  return path.resolve(repoRoot(), p);
}

function hydrateSession(session) {
  return {
    ...session,
    usDir: resolveMaybeRelative(session.usDir),
    logPath: resolveMaybeRelative(session.logPath),
  };
}

function persistSession(session) {
  return {
    ...session,
    usDir: toPosixRelative(session.usDir),
    logPath: toPosixRelative(session.logPath),
  };
}

function sessionPath(session) {
  const usDir = resolveMaybeRelative(session.usDir);
  return path.join(usDir, `.audit-session-${session.slug}.json`);
}

function logPath(session) {
  if (session.logPath) return resolveMaybeRelative(session.logPath);
  const stamp = session.startedAt.replace(/[:.]/g, '-');
  return path.join(resolveMaybeRelative(session.usDir), `audit-${session.slug}-${stamp}.log.md`);
}

function writeSession(session) {
  const hydrated = hydrateSession(session);
  fs.mkdirSync(hydrated.usDir, { recursive: true });
  fs.writeFileSync(sessionPath(hydrated), JSON.stringify(persistSession(hydrated), null, 2) + '\n', 'utf-8');
}

function loadSession(sessionArg) {
  const session = hydrateSession(readJsonArg(sessionArg, 'session'));
  if (!session.usDir || !session.slug) {
    console.error('Error: session must include usDir and slug');
    process.exit(2);
  }
  return session;
}

function resolveSessionInput(opts) {
  const raw = opts.sessionFile
    ? readJsonFile(opts.sessionFile, 'session-file')
    : readJsonArg(opts.session, 'session');
  if (!raw.usDir || !raw.slug) {
    console.error('Error: session must include usDir and slug');
    process.exit(2);
  }
  return hydrateSession(raw);
}

function resolveFindingInput(opts) {
  if (opts.findingFile) return readJsonFile(opts.findingFile, 'finding-file');
  return readJsonArg(opts.finding, 'finding');
}

function formatFinding(f) {
  const lines = [
    `### Finding`,
    '',
    `- **timestamp:** ${f.timestamp}`,
    `- **step:** ${f.step}`,
    `- **skill:** ${f.skill ?? '(unknown)'}`,
    `- **category:** ${f.category}`,
    `- **severity:** ${f.severity}`,
    `- **recovered:** ${f.recovered === true ? 'true' : 'false'}`,
    `- **summary:** ${f.summary}`,
  ];
  if (f.language) {
    lines.push(`- **language:** ${f.language}`);
  }
  if (f.targetAbstraction) {
    lines.push(`- **targetAbstraction:** ${f.targetAbstraction}`);
  }
  if (f.recommendation) {
    lines.push(`- **recommendation:** ${f.recommendation}`);
  }
  if (f.evidence) {
    lines.push(`- **evidence:** ${f.evidence}`);
  }
  lines.push('');
  return lines.join('\n');
}

export function initAudit({ usDir, slug, workflowId }) {
  const startedAt = isoNow();
  const absUsDir = resolveMaybeRelative(usDir);
  const absLog = path.join(
    absUsDir,
    `audit-${slug}-${startedAt.replace(/[:.]/g, '-')}.log.md`,
  );
  const session = {
    usDir: absUsDir,
    slug,
    workflowId: workflowId || null,
    startedAt,
    finalized: false,
    findings: [],
    logPath: absLog,
  };
  fs.mkdirSync(absUsDir, { recursive: true });
  const header = [
    '---',
    `slug: ${slug}`,
    `workflowId: ${workflowId || 'null'}`,
    `startedAt: ${startedAt}`,
    '---',
    '',
    '# Runtime audit log',
    '',
    `Workflow: ${slug}`,
    '',
    '## Findings',
    '',
  ].join('\n');
  fs.writeFileSync(absLog, header, 'utf-8');
  writeSession(session);
  return session;
}

export function appendFinding(session, finding) {
  const f = {
    timestamp: finding.timestamp || isoNow(),
    step: finding.step ?? 'other',
    skill: finding.skill ?? null,
    category: finding.category || 'other',
    severity: finding.severity || 'unusual',
    summary: finding.summary || '(no summary)',
    evidence: finding.evidence ?? null,
    language: finding.language ?? null,
    targetAbstraction: finding.targetAbstraction ?? null,
    recommendation: finding.recommendation ?? null,
    recovered: finding.recovered === true,
  };
  if (!VALID_CATEGORIES.has(f.category)) {
    f.category = 'other';
  }
  if (!VALID_SEVERITIES.has(f.severity)) {
    f.severity = 'unusual';
  }
  session.findings.push(f);
  fs.appendFileSync(resolveMaybeRelative(session.logPath), formatFinding(f), 'utf-8');
  writeSession(session);
  return f;
}

export function finalizeAudit(session) {
  if (session.finalized) {
    return session;
  }
  const errorCount = session.findings.filter((x) => x.severity === 'error').length;
  const unusualCount = session.findings.filter((x) => x.severity === 'unusual').length;
  const suggestionCount = session.findings.filter(
    (x) =>
      x.severity === 'suggestion' ||
      x.severity === 'opportunity' ||
      ['disposable-script', 'performance', 'correctness', 'optimization'].includes(x.category),
  ).length;
  const disposableScriptCount = session.findings.filter((x) => x.category === 'disposable-script').length;

  const suggestions = session.findings.filter(
    (x) =>
      x.severity === 'suggestion' ||
      x.severity === 'opportunity' ||
      ['disposable-script', 'performance', 'correctness', 'optimization'].includes(x.category),
  );

  const sections = [];

  if (suggestions.length > 0) {
    sections.push('## Improvement Opportunities & Reusable Tooling', '');
    for (const s of suggestions) {
      sections.push(
        `- [${s.category}] **step ${s.step}**: ${s.summary}${s.recommendation ? ` — *Recommendation:* ${s.recommendation}` : ''}`,
      );
    }
    sections.push('');
  }

  sections.push(
    '## Summary',
    '',
    `- **errors:** ${errorCount}`,
    `- **unusual:** ${unusualCount}`,
    `- **suggestions/opportunities:** ${suggestionCount}`,
    `- **disposable scripts detected:** ${disposableScriptCount}`,
    `- **total findings:** ${session.findings.length}`,
    `- **finalizedAt:** ${isoNow()}`,
    '',
  );

  fs.appendFileSync(resolveMaybeRelative(session.logPath), sections.join('\n'), 'utf-8');
  session.finalized = true;
  session.finalizedAt = isoNow();
  session.errorCount = errorCount;
  session.unusualCount = unusualCount;
  session.suggestionCount = suggestionCount;
  session.disposableScriptCount = disposableScriptCount;
  // Keep session file so has-errors / draft-issue --session-file still works after finalize.
  writeSession(session);
  const root = repoRoot();
  const packageFile = path.join(root, 'package.json');
  const packageVersion = fs.existsSync(packageFile) ? JSON.parse(fs.readFileSync(packageFile, 'utf-8')).version : 'unknown';
  const telemetryDir = path.join(resolveMaybeRelative(session.usDir), 'telemetry');
  fs.mkdirSync(telemetryDir, { recursive: true });
  const sessionCounts = {
    acTotal: Number(session.acTotal || 0),
    acImplemented: Number(session.acImplemented || 0),
  };
  syncAcCountsFromLedger(sessionCounts, resolveMaybeRelative(session.usDir));
  const { acTotal, acImplemented } = sessionCounts;
  fs.appendFileSync(path.join(telemetryDir, 'audit.jsonl'), `${JSON.stringify({
    schemaVersion: 1,
    type: 'audit-finalize',
    timestamp: session.finalizedAt,
    workflowId: session.workflowId || session.slug,
    pipeline: session.workflowType === 'lite' ? 'lite' : 'standard',
    packageVersion,
    step: Number(session.step || 9),
    model: String(session.model || 'unknown'),
    retries: Number(session.retries || 0),
    reviewRounds: Number(session.reviewRounds || 0),
    refineRounds: Number(session.refineRounds || 0),
    skipReason: null,
    acTotal,
    acImplemented,
    auditCounts: { errors: errorCount, unusual: unusualCount, suggestions: suggestionCount },
  })}\n`, 'utf-8');
  return session;
}

export function hasActionableErrors(session) {
  return session.findings.some((x) => x.severity === 'error');
}

export function hasActionableSuggestions(session) {
  return session.findings.some(
    (x) =>
      x.severity === 'suggestion' ||
      x.severity === 'opportunity' ||
      ['disposable-script', 'performance', 'correctness', 'optimization'].includes(x.category),
  );
}

export function draftIssueBody(session, upstream = resolveUpstreamRepo()) {
  const errors = session.findings.filter((x) => x.severity === 'error');
  const title = `[runtime-audit] ${session.slug}: ${errors.length} skill execution error(s)`;
  const lines = [
    '## Summary',
    '',
    `Runtime audit wrapper recorded **${errors.length}** actionable error(s) during \`${session.slug}\` workflow execution.`,
    'Delivery may have succeeded after model recovery; skill/hub content may still be defective.',
    '',
    `**Audit log:** ${session.logPath}`,
    '',
    '## Findings (errors)',
    '',
  ];
  for (const f of errors) {
    lines.push(
      `### ${f.category} — step ${f.step}${f.skill ? ` (${f.skill})` : ''}`,
      '',
      `- **summary:** ${f.summary}`,
      `- **recovered:** ${f.recovered}`,
    );
    if (f.evidence) lines.push(`- **evidence:** ${f.evidence}`);
    lines.push('');
  }
  lines.push('## Suggested action', '', 'Fix managed skill/hub/script content in the upstream package.', '');
  return { title, body: lines.join('\n'), upstream, logPath: session.logPath };
}

export function draftSuggestionsIssueBody(session, upstream = resolveUpstreamRepo()) {
  const suggestions = session.findings.filter(
    (x) =>
      x.severity === 'suggestion' ||
      x.severity === 'opportunity' ||
      ['disposable-script', 'performance', 'correctness', 'optimization'].includes(x.category),
  );
  const disposableScripts = suggestions.filter((x) => x.category === 'disposable-script');
  const performanceIssues = suggestions.filter((x) => x.category === 'performance');
  const correctnessIssues = suggestions.filter((x) => x.category === 'correctness');
  const otherSuggestions = suggestions.filter(
    (x) => !['disposable-script', 'performance', 'correctness'].includes(x.category),
  );

  const title = `[upstream-suggestion] ${session.slug}: ${suggestions.length} workflow optimization & reusable tooling opportunity(ies)`;
  const lines = [
    '## Summary',
    '',
    `Runtime audit observer identified **${suggestions.length}** workflow improvement and upstream tooling opportunity(ies) during \`${session.slug}\` execution.`,
    '',
    `**Audit log:** ${session.logPath}`,
    '',
  ];

  if (disposableScripts.length > 0) {
    lines.push('## Disposable Script Opportunities (Pre-generation candidates)', '');
    lines.push('The agent created or executed ad-hoc/scratch scripts that could be standardized into permanent upstream tools/scripts:', '');
    for (const f of disposableScripts) {
      lines.push(
        `### ${f.summary} (step ${f.step}${f.skill ? ` / ${f.skill}` : ''})`,
        '',
        `- **language:** ${f.language ?? '(unspecified)'}`,
        `- **target abstraction:** ${f.targetAbstraction ?? '(proposed upstream script/utility)'}`,
      );
      if (f.recommendation) lines.push(`- **recommendation:** ${f.recommendation}`);
      if (f.evidence) lines.push(`- **evidence:** ${f.evidence}`);
      lines.push('');
    }
  }

  if (performanceIssues.length > 0) {
    lines.push('## Performance Bottlenecks & Inefficiencies', '');
    for (const f of performanceIssues) {
      lines.push(
        `### ${f.summary} (step ${f.step}${f.skill ? ` / ${f.skill}` : ''})`,
        '',
      );
      if (f.recommendation) lines.push(`- **recommendation:** ${f.recommendation}`);
      if (f.evidence) lines.push(`- **evidence:** ${f.evidence}`);
      lines.push('');
    }
  }

  if (correctnessIssues.length > 0) {
    lines.push('## Correctness & Fragility Warnings', '');
    for (const f of correctnessIssues) {
      lines.push(
        `### ${f.summary} (step ${f.step}${f.skill ? ` / ${f.skill}` : ''})`,
        '',
      );
      if (f.recommendation) lines.push(`- **recommendation:** ${f.recommendation}`);
      if (f.evidence) lines.push(`- **evidence:** ${f.evidence}`);
      lines.push('');
    }
  }

  if (otherSuggestions.length > 0) {
    lines.push('## General Optimization Opportunities', '');
    for (const f of otherSuggestions) {
      lines.push(
        `### ${f.summary} (step ${f.step}${f.skill ? ` / ${f.skill}` : ''})`,
        '',
      );
      if (f.recommendation) lines.push(`- **recommendation:** ${f.recommendation}`);
      if (f.evidence) lines.push(`- **evidence:** ${f.evidence}`);
      lines.push('');
    }
  }

  lines.push(
    '## Suggested action',
    '',
    'Consider adding pre-built companion scripts, CLI subcommands, or prompt tuning in the upstream package to prevent redundant ad-hoc script generation and improve execution efficiency.',
    '',
  );

  return { title, body: lines.join('\n'), upstream, logPath: session.logPath };
}

export function draftCombinedIssueBody(session, upstream = resolveUpstreamRepo()) {
  const errors = session.findings.filter((x) => x.severity === 'error');
  const suggestions = session.findings.filter(
    (x) =>
      x.severity === 'suggestion' ||
      x.severity === 'opportunity' ||
      ['disposable-script', 'performance', 'correctness', 'optimization'].includes(x.category),
  );

  const title = `[runtime-audit] ${session.slug}: ${errors.length} error(s), ${suggestions.length} suggestion(s)`;
  const lines = [
    '## Summary',
    '',
    `Runtime audit wrapper recorded **${errors.length}** error(s) and **${suggestions.length}** suggestion/tooling opportunity(ies) during \`${session.slug}\` execution.`,
    '',
    `**Audit log:** ${session.logPath}`,
    '',
  ];

  if (errors.length > 0) {
    lines.push('## Execution Errors', '');
    for (const f of errors) {
      lines.push(
        `### ${f.category} — step ${f.step}${f.skill ? ` (${f.skill})` : ''}`,
        '',
        `- **summary:** ${f.summary}`,
        `- **recovered:** ${f.recovered}`,
      );
      if (f.evidence) lines.push(`- **evidence:** ${f.evidence}`);
      lines.push('');
    }
  }

  if (suggestions.length > 0) {
    lines.push('## Improvement & Tooling Opportunities', '');
    for (const f of suggestions) {
      lines.push(
        `### [${f.category}] ${f.summary} (step ${f.step}${f.skill ? ` / ${f.skill}` : ''})`,
        '',
      );
      if (f.language) lines.push(`- **language:** ${f.language}`);
      if (f.targetAbstraction) lines.push(`- **target abstraction:** ${f.targetAbstraction}`);
      if (f.recommendation) lines.push(`- **recommendation:** ${f.recommendation}`);
      if (f.evidence) lines.push(`- **evidence:** ${f.evidence}`);
      lines.push('');
    }
  }

  lines.push(
    '## Suggested action',
    '',
    'Review execution errors and consider upstream script additions in the package.',
    '',
  );

  return { title, body: lines.join('\n'), upstream, logPath: session.logPath };
}

function parseCli(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  const opts = {};
  for (let i = 1; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--us-dir') opts.usDir = args[++i];
    else if (a === '--slug') opts.slug = args[++i];
    else if (a === '--workflow-id') opts.workflowId = args[++i];
    else if (a === '--session') opts.session = args[++i];
    else if (a === '--session-file') opts.sessionFile = args[++i];
    else if (a === '--finding') opts.finding = args[++i];
    else if (a === '--finding-file') opts.findingFile = args[++i];
    else if (a === '--config') opts.config = args[++i];
    else if (a === '--upstream') opts.upstream = args[++i];
    else if (a === '--type') opts.type = args[++i];
    else if (a === '--help' || a === '-h') opts.help = true;
    else {
      console.error(`Unknown arg: ${a}`);
      usage();
      process.exit(2);
    }
  }
  return { cmd, opts };
}

function main() {
  const { cmd, opts } = parseCli(process.argv);
  if (opts.help || !cmd) {
    usage();
    process.exit(cmd ? 0 : 2);
  }

  if (cmd === 'resolve') {
    const enabled = resolveEnableAuditing(opts.config);
    console.log(JSON.stringify({ enableAuditing: enabled }));
    return;
  }

  if (cmd === 'init') {
    if (!opts.usDir || !opts.slug) {
      console.error('Error: init requires --us-dir and --slug');
      process.exit(2);
    }
    const session = initAudit({
      usDir: opts.usDir,
      slug: opts.slug,
      workflowId: opts.workflowId,
    });
    console.log(JSON.stringify({ status: 'success', session }));
    return;
  }

  if (cmd === 'append') {
    const session = resolveSessionInput(opts);
    const finding = resolveFindingInput(opts);
    appendFinding(session, finding);
    console.log(JSON.stringify({ status: 'success', session }));
    return;
  }

  if (cmd === 'finalize') {
    const session = resolveSessionInput(opts);
    finalizeAudit(session);
    console.log(JSON.stringify({ status: 'success', session }));
    return;
  }

  if (cmd === 'has-errors') {
    const session = resolveSessionInput(opts);
    console.log(
      JSON.stringify({
        hasErrors: hasActionableErrors(session),
        errorCount: session.findings.filter((x) => x.severity === 'error').length,
      }),
    );
    return;
  }

  if (cmd === 'has-suggestions') {
    const session = resolveSessionInput(opts);
    const suggestionCount = session.findings.filter(
      (x) =>
        x.severity === 'suggestion' ||
        x.severity === 'opportunity' ||
        ['disposable-script', 'performance', 'correctness', 'optimization'].includes(x.category),
    ).length;
    console.log(
      JSON.stringify({
        hasSuggestions: hasActionableSuggestions(session),
        suggestionCount,
      }),
    );
    return;
  }

  if (cmd === 'draft-issue') {
    const session = resolveSessionInput(opts);
    if (opts.type === 'suggestion') {
      const draft = draftSuggestionsIssueBody(session, opts.upstream);
      console.log(JSON.stringify({ status: 'success', draft }));
      return;
    }
    if (opts.type === 'all') {
      const draft = draftCombinedIssueBody(session, opts.upstream);
      console.log(JSON.stringify({ status: 'success', draft }));
      return;
    }
    const draft = draftIssueBody(session, opts.upstream);
    console.log(JSON.stringify({ status: 'success', draft }));
    return;
  }

  if (cmd === 'draft-suggestions-issue') {
    const session = resolveSessionInput(opts);
    const draft = draftSuggestionsIssueBody(session, opts.upstream);
    console.log(JSON.stringify({ status: 'success', draft }));
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  usage();
  process.exit(2);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}

