#!/usr/bin/env node
/**
 * ws-doctor — read-only diagnostic engine for installed ws-* skills.
 * CLI: node doctor.js [--skill <id>] [--json] [--help]
 * No filesystem writes (stdout/stderr only). UTF-8 I/O explicit.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';

const DEFAULT_SWITCH_KEYS = [
  'autoMode',
  'dryRun',
  'skipTesting',
  'skipMutationTesting',
  'skipTests',
  'fullMode',
  'scoreAndRefine',
  'autoload',
  'enableAuditing',
];

const DELIVERY_ARTIFACT_KEYS = [
  'includeRefinedPlan',
  'includeDeliveryResult',
  'includeSpec',
  'includeCheckReport',
  'includeCodeReview',
  'includeTestingReport',
];

const LAUNCHERS = new Set(['python', 'node', 'bash']);

const SCRIPT_EXT_RE = /\.(py|cjs|mjs|js|sh)$/i;
const MD_LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g;
const BRACE_TOKEN_RE = /\{([A-Za-z0-9_-]+)\}/g;
const BACKTICK_RE = /`([^`\n]+)`/g;
/** Drive paths: avoid matching URL schemes like https:// (MEMORY trap). */
const WIN_DRIVE_RE = /(?<![A-Za-z0-9])[A-Za-z]:[\\/]/;
const PLACEHOLDER_RE = /^<[^>]+>$/;

function usage() {
  const lines = [
    'Usage: node doctor.js [--skill <id>] [--json] [--persist [dir]] [--help]',
    '',
    '  --skill <id>  Limit path/tool/ref scan to one ws-* skill folder',
    '  --json        Machine-readable JSON report',
    '  --persist     Save a dated comparable artifact under plans.diagnosticsDir',
    '  --help        Show this help',
    '',
    'Read-only diagnose of skillsRoot + project ws-shared config.',
  ];
  console.log(lines.join('\n'));
}

function parseArgs(argv) {
  const args = { skill: null, json: false, help: false, persist: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
    if (a === '--json') {
      args.json = true;
      continue;
    }
    if (a === '--persist') {
      args.persist = rest[i + 1] && !rest[i + 1].startsWith('-') ? rest[++i] : true;
      continue;
    }
    if (a === '--skill') {
      args.skill = rest[i + 1] || null;
      i += 1;
      if (!args.skill) {
        console.error('Error: --skill requires an id');
        process.exit(2);
      }
      continue;
    }
    if (a.startsWith('-')) {
      console.error(`Unknown option: ${a}`);
      usage();
      process.exit(2);
    }
    console.error(`Unexpected argument: ${a}`);
    usage();
    process.exit(2);
  }
  return args;
}

function readUtf8(filePath) {
  return fs.readFileSync(filePath, { encoding: 'utf8' });
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function toPosix(p) {
  return String(p).replace(/\\/g, '/');
}

function asciiSafe(s) {
  // Prefer ASCII stdout (MEMORY / cross-platform); map common punctuation before '?'.
  return String(s)
    .replace(/\u2014/g, ' - ') // em dash
    .replace(/\u2013/g, '-') // en dash
    .replace(/\u2192/g, '->') // right arrow
    .replace(/\u2190/g, '<-') // left arrow
    .replace(/\u2026/g, '...') // ellipsis
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '?');
}

function loadJson(filePath) {
  if (!exists(filePath)) return { ok: false, reason: 'missing', data: null };
  try {
    const raw = readUtf8(filePath);
    return { ok: true, reason: null, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, reason: `invalid-json: ${err.message}`, data: null };
  }
}

function resolveProjectSharedDir(projectRoot) {
  return path.resolve(projectRoot, '.agents', 'skills', 'ws-shared');
}

function resolveGlobalSkillsRoot() {
  const env = process.env.WORKFLOW_SKILLS_GLOBAL_DIR;
  if (env && String(env).trim()) return path.resolve(String(env).trim());
  return path.join(os.homedir(), '.agents', 'skills');
}

/**
 * Build path token map. sharedDir/config always from project hub (hybrid).
 * skillsRoot may differ physically in hybrid installs.
 */
function buildTokenMap(projectRoot, config) {
  const pt = (config && config.pathTokens) || {};
  const plans = (config && config.plans) || {};
  const reviews = (config && config.reviews) || {};

  const skillsRootRel = (pt.skillsRoot && String(pt.skillsRoot).trim()) || '.agents/skills';
  const sharedDirRel =
    (pt.sharedDir && String(pt.sharedDir).trim()) || '.agents/skills/ws-shared';
  const plansDirRel = (plans.dir && String(plans.dir).trim()) || '.agents/plans';
  const specsDirRel = (plans.specsDir && String(plans.specsDir).trim()) || '.agents/specs';
  const reviewsDirRel = (reviews.dir && String(reviews.dir).trim()) || '.agents/codereviews';

  const skillsRootAbs = path.resolve(projectRoot, skillsRootRel);
  const sharedDirAbs = path.resolve(projectRoot, sharedDirRel);
  // Project hub always wins for config; keep absolute shared for hybrid clarity.
  const projectSharedAbs = resolveProjectSharedDir(projectRoot);
  const effectiveSharedAbs = exists(projectSharedAbs) ? projectSharedAbs : sharedDirAbs;

  const globalSkillsRoot = resolveGlobalSkillsRoot();

  return {
    skillsRoot: toPosix(path.relative(projectRoot, skillsRootAbs) || skillsRootRel),
    sharedDir: toPosix(path.relative(projectRoot, effectiveSharedAbs) || sharedDirRel),
    plansDir: toPosix(plansDirRel),
    specsDir: toPosix(specsDirRel),
    reviewsDir: toPosix(reviewsDirRel),
    globalSkillsRoot: toPosix(globalSkillsRoot),
    'us-dir': '{plansDir}/{slug}',
    _abs: {
      projectRoot,
      skillsRoot: skillsRootAbs,
      sharedDir: effectiveSharedAbs,
      plansDir: path.resolve(projectRoot, plansDirRel),
      specsDir: path.resolve(projectRoot, specsDirRel),
      reviewsDir: path.resolve(projectRoot, reviewsDirRel),
      globalSkillsRoot,
    },
  };
}

function expandTokens(cited, tokenMap) {
  let out = String(cited);
  // Expand nested: sharedDir may embed skillsRoot conceptually — substitute known tokens once each, twice for nesting.
  for (let pass = 0; pass < 3; pass += 1) {
    out = out.replace(BRACE_TOKEN_RE, (full, name) => {
      if (name === 'us-dir') return tokenMap['us-dir'] || full;
      if (Object.prototype.hasOwnProperty.call(tokenMap, name) && name !== '_abs') {
        return tokenMap[name];
      }
      return full;
    });
  }
  return out;
}

function remainingBraces(s) {
  const left = [];
  let m;
  const re = /\{([A-Za-z0-9_-]+)\}/g;
  while ((m = re.exec(s)) !== null) left.push(m[1]);
  return left;
}

function isTemplateOrGlobPath(s) {
  const t = String(s);
  if (t.includes('*') || t.includes('?')) return true;
  if (/\[[^\]]+\]/.test(t)) return true; // [slug], [Name]
  if (/YYYY|MM-DD|<[^>]+>/.test(t)) return true;
  if (/(^|\/)\.runtime\//.test(t.replace(/\\/g, '/'))) return true;
  if (t.includes('...') || t.includes('\u2026')) return true;
  if (/\{[^}]+,[^}]+\}/.test(t)) return true; // {a,b,c} brace expansion examples
  if (/=/.test(t) && /\{[A-Za-z0-9_-]+\}/.test(t)) return true; // {skillsRoot}=...
  return false;
}

function isTrivialCitation(s) {
  const t = String(s).trim();
  if (!t) return true;
  if (t.length <= 2) return true;
  if (LAUNCHERS.has(t)) return true;
  if (/^(true|false|null|none|yes|no)$/i.test(t)) return true;
  if (/^n\s*\/\s*a$/i.test(t)) return true;
  // Single-segment dir examples in prose (src/, web/, shared/) — not skill citations
  if (/^[A-Za-z0-9_-]+\/?$/.test(t) && !SCRIPT_EXT_RE.test(t) && !/\.(md|mdc|json|yml|yaml|txt)$/i.test(t)) {
    return true;
  }
  // gh / REST path fragments without project roots (repos/owner/name/...)
  if (/^repos\/[A-Za-z0-9_.-]+\//.test(t) && !t.includes('.agents/') && !/\{[A-Za-z0-9_-]+\}/.test(t)) {
    return true;
  }
  // Regex / escape fragments in prose (AC\d+, \r\n) — not filesystem paths
  if (/\\[A-Za-z0-9]/.test(t) && !WIN_DRIVE_RE.test(t)) return true;
  return false;
}

function isUrlOrAnchor(target) {
  const t = String(target).trim();
  if (!t || t.startsWith('#')) return true;
  if (/^mailto:/i.test(t)) return true;
  if (/^https?:\/\//i.test(t)) return true;
  // Any URI scheme that is not a Windows drive (C:/) — includes github:, npx-style, etc.
  if (/^[a-z][a-z0-9+.-]*:/i.test(t) && !WIN_DRIVE_RE.test(t)) return true;
  return false;
}

/** Markdown link targets may be bare companions (PHASES.md) relative to the citing file. */
function looksLikeLinkTarget(s) {
  const t = String(s).trim();
  if (!t || t.length > 400) return false;
  if (isUrlOrAnchor(t)) return false;
  if (t.startsWith('-')) return false; // CLI flags, not paths
  if (t.startsWith('$')) return false; // shell vars; handled separately if $PWD/.agents/...
  return (
    t.includes('/') ||
    t.includes('\\') ||
    t.startsWith('.') ||
    /\{[A-Za-z0-9_-]+\}/.test(t) ||
    SCRIPT_EXT_RE.test(t) ||
    /\.(md|mdc|json|yml|yaml|txt)$/i.test(t) ||
    WIN_DRIVE_RE.test(t)
  );
}

/**
 * Backtick prose paths need a directory/token cue — bare `tools.md` is usually
 * link text / vocabulary, not a filesystem citation (avoids false positives).
 */
function looksLikeBacktickPath(s) {
  const t = String(s).trim();
  if (!t || t.length > 400) return false;
  if (isUrlOrAnchor(t)) return false;
  if (t.startsWith('-')) return false;
  if (isTrivialCitation(t)) return false;
  // owner/repo style without path depth / extension — not a local path
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(t) && !t.startsWith('.') && !/\.(md|json|py|js|cjs|mjs|sh)$/i.test(t)) {
    return false;
  }
  return (
    t.includes('/') ||
    t.includes('\\') ||
    t.startsWith('./') ||
    t.startsWith('../') ||
    /\{[A-Za-z0-9_-]+\}/.test(t) ||
    /^\.agents\b/.test(t) ||
    /^\$PWD[\\/]/.test(t) ||
    /^~[\\/]/.test(t) ||
    WIN_DRIVE_RE.test(t)
  );
}

function posixRelToRoot(rootAbs, fileAbs) {
  const rel = toPosix(path.relative(path.resolve(rootAbs), path.resolve(fileAbs)));
  if (!rel || rel === '..' || rel.startsWith('../')) return '';
  if (path.isAbsolute(rel) || WIN_DRIVE_RE.test(rel)) return '';
  return rel;
}

function isCitingFromPublishedSkillFolder(sourceFile, projectRoot, tokenMap) {
  const abs = tokenMap._abs || {};
  const roots = [abs.skillsRoot, abs.globalSkillsRoot].filter(Boolean);
  if (roots.length === 0 && tokenMap.skillsRoot) {
    roots.push(path.resolve(projectRoot, tokenMap.skillsRoot));
  }
  const absSource = path.resolve(sourceFile);
  for (const rootAbs of roots) {
    const rel = posixRelToRoot(rootAbs, absSource);
    const m = rel.match(/^(ws-[^/]+)\//);
    if (m && m[1] !== 'ws-shared') return true;
  }
  return false;
}

function resolveCitedPath(cited, sourceFile, projectRoot, tokenMap) {
  // Token-expanded citations are project-root relative; plain markdown links stay file-relative.
  const hadToken = /\{[A-Za-z0-9_-]+\}/.test(cited);
  const expanded = expandTokens(cited.trim(), tokenMap);
  const braces = remainingBraces(expanded);
  if (braces.length > 0) {
    return { kind: 'template', expanded, braces };
  }

  let candidate = expanded.replace(/\\/g, '/');
  // Shell cwd / home prefixes → normalize
  candidate = candidate
    .replace(/^\$PWD\//, '')
    .replace(/^\$\{PWD\}\//, '')
    .replace(/^\$HOME\//, '')
    .replace(/^\$\{HOME\}\//, '')
    .replace(/^~\//, '');
  // Undeclared hub shorthand ws-shared/... → sharedDir
  if (/^ws-shared(\/|$)/.test(candidate)) {
    candidate = `${tokenMap.sharedDir}/${candidate.slice('ws-shared/'.length)}`.replace(/\/$/, '');
    candidate = candidate.replace(/\/+/g, '/');
  }
  if (candidate.startsWith('./')) candidate = candidate.slice(2);

  // Skip unresolved shell/env stubs
  if (candidate.startsWith('$')) {
    return { kind: 'template', expanded: candidate, braces: ['$'] };
  }

  let abs;
  // Slash-command style (/ship-pr) — not a filesystem absolute path
  if (/^\/[A-Za-z0-9_-]+$/.test(candidate)) {
    return { kind: 'template', expanded: candidate, braces: ['invoke'] };
  }
  if (path.isAbsolute(candidate) || WIN_DRIVE_RE.test(candidate)) {
    abs = path.resolve(candidate);
  } else if (
    candidate.startsWith('.agents/') ||
    candidate.startsWith('AGENTS.md') ||
    candidate.startsWith('README.md') ||
    candidate.startsWith('bin/') ||
    (candidate.startsWith('docs/') &&
      !isCitingFromPublishedSkillFolder(sourceFile, projectRoot, tokenMap)) ||
    candidate.startsWith('specs/') ||
    candidate.startsWith('test/') ||
    /^ws-[a-z0-9-]+(\/|$)/i.test(candidate)
  ) {
    if (/^ws-[a-z0-9-]+(\/|$)/i.test(candidate)) {
      candidate = `${tokenMap.skillsRoot}/${candidate}`.replace(/\/+/g, '/');
    }
    abs = path.resolve(projectRoot, candidate);
  } else if (hadToken) {
    abs = path.resolve(projectRoot, candidate);
  } else {
    // Relative to citing file (markdown companion links)
    abs = path.resolve(path.dirname(sourceFile), candidate);
  }

  return {
    kind: 'path',
    expanded: toPosix(path.relative(projectRoot, abs) || candidate),
    abs,
    exists: exists(abs),
  };
}

function listSkillDirs(skillsRootAbs, skillFilter) {
  if (!isDir(skillsRootAbs)) return [];
  const names = fs.readdirSync(skillsRootAbs).filter((n) => {
    if (!n.startsWith('ws-')) return false;
    if (n === 'ws-shared') return false;
    return isDir(path.join(skillsRootAbs, n));
  });
  names.sort();
  if (!skillFilter) return names.map((id) => ({ id, dir: path.join(skillsRootAbs, id) }));

  const want = normalizeSkillId(skillFilter);
  const hit = names.find((n) => n === want || n === `ws-${want}` || n.replace(/^ws-/, '') === want.replace(/^ws-/, ''));
  if (hit) return [{ id: hit, dir: path.join(skillsRootAbs, hit) }];
  // Hybrid: try global
  return [];
}

function normalizeSkillId(id) {
  const s = String(id).trim();
  if (!s) return s;
  return s.startsWith('ws-') ? s : `ws-${s}`;
}

function collectMarkdownFiles(skillDir) {
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === 'node_modules' || ent.name === '__pycache__' || ent.name === '.git') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && /\.(md|mdc)$/i.test(ent.name)) out.push(full);
    }
  }
  walk(skillDir);
  return out;
}

function collectScriptFiles(skillDir) {
  const scriptsDir = path.join(skillDir, 'scripts');
  if (!isDir(scriptsDir)) return [];
  const out = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name === '__pycache__' || ent.name === 'node_modules') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.isFile() && SCRIPT_EXT_RE.test(ent.name)) out.push(full);
    }
  }
  walk(scriptsDir);
  return out;
}

function extractLinks(content) {
  const links = [];
  let m;
  const re = new RegExp(MD_LINK_RE.source, 'g');
  while ((m = re.exec(content)) !== null) {
    links.push({ text: m[1], target: m[2], index: m.index });
  }
  return links;
}

function extractBackticks(content) {
  const items = [];
  let m;
  const re = new RegExp(BACKTICK_RE.source, 'g');
  while ((m = re.exec(content)) !== null) {
    items.push({ value: m[1].trim(), index: m.index });
  }
  return items;
}

function commandHasLauncher(cmd) {
  const trimmed = cmd.trim();
  // Match launcher as first token or after && / ; / |
  const parts = trimmed.split(/\s*(?:&&|;|\|)\s*/);
  return parts.some((p) => {
    const tok = p.trim().split(/\s+/)[0];
    return LAUNCHERS.has(tok);
  });
}

function isManagedScriptCitation(value, tokenMap) {
  const v = value.trim();
  if (isUrlOrAnchor(v)) return false;
  // Path token may be followed by CLI args — inspect first path-like token
  const pathTok =
    v
      .replace(/^(python|node|bash)\s+/i, '')
      .trim()
      .split(/\s+/)
      .find(
        (tok) =>
          SCRIPT_EXT_RE.test(tok) ||
          /\{skillsRoot\}/.test(tok) ||
          /\/scripts\//.test(tok),
      ) || null;
  if (!pathTok) return false;
  if (!SCRIPT_EXT_RE.test(pathTok) && !/\/scripts\//.test(pathTok) && !/\{skillsRoot\}/.test(pathTok)) {
    return false;
  }
  // Only managed skill scripts under ws-*/scripts (not bin/, test/, etc.)
  const expanded = expandTokens(pathTok, tokenMap);
  if (isUrlOrAnchor(expanded)) return false;
  return (
    /\{skillsRoot\}/.test(pathTok) ||
    /ws-[a-z0-9-]+\/scripts\//i.test(pathTok) ||
    /(?:^|\/)ws-[a-z0-9-]+\/scripts\//i.test(expanded)
  );
}

function whichLauncher(bin) {
  const isWin = process.platform === 'win32';
  const probe = isWin ? 'where' : 'which';
  const r = spawnSync(probe, [bin], { encoding: 'utf8', shell: false });
  if (r.status === 0 && String(r.stdout || '').trim()) return true;
  // Windows: try .cmd / bare
  if (isWin) {
    const r2 = spawnSync(bin, ['--version'], { encoding: 'utf8', shell: true });
    return r2.status === 0 || r2.status === null;
  }
  return false;
}

const launcherAvailable = {
  python: null,
  node: null,
  bash: null,
};

function ensureLauncherProbe(name) {
  if (launcherAvailable[name] === null) {
    launcherAvailable[name] = whichLauncher(name);
  }
  return launcherAvailable[name];
}

function parseCheckScript(fileAbs) {
  const ext = path.extname(fileAbs).toLowerCase();
  const relHint = toPosix(fileAbs);

  if (ext === '.py') {
    if (!ensureLauncherProbe('python')) {
      return { status: 'skipped', error: 'python launcher not on PATH' };
    }
    // ast.parse — no .pyc write (read-only preference)
    const r = spawnSync(
      'python',
      [
        '-c',
        'import ast,sys; p=sys.argv[1]; ast.parse(open(p,encoding="utf-8").read())',
        fileAbs,
      ],
      { encoding: 'utf8', shell: false },
    );
    if (r.status === 0) return { status: 'ok', error: null };
    const errLines = asciiSafe((r.stderr || r.stdout || 'parse failed').trim()).split(/\r?\n/);
    const interesting =
      errLines.find((ln) => /Error|Syntax|invalid/i.test(ln)) || errLines[errLines.length - 1] || 'parse failed';
    return { status: 'fail', error: interesting };
  }

  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') {
    if (!ensureLauncherProbe('node')) {
      return { status: 'skipped', error: 'node launcher not on PATH' };
    }
    const r = spawnSync('node', ['--check', fileAbs], { encoding: 'utf8', shell: false });
    if (r.status === 0) return { status: 'ok', error: null };
    const err = asciiSafe((r.stderr || r.stdout || 'syntax check failed').trim().split(/\r?\n/)[0] || 'syntax check failed');
    return { status: 'fail', error: err };
  }

  if (ext === '.sh') {
    if (!ensureLauncherProbe('bash')) {
      return { status: 'skipped', error: 'bash launcher not on PATH' };
    }
    const r = spawnSync('bash', ['-n', fileAbs], { encoding: 'utf8', shell: false });
    if (r.status === 0) return { status: 'ok', error: null };
    const err = asciiSafe((r.stderr || r.stdout || 'bash -n failed').trim().split(/\r?\n/)[0] || 'bash -n failed');
    return { status: 'fail', error: err };
  }

  return { status: 'skipped', error: `unsupported extension for ${relHint}` };
}

function scanPathAndRefs(files, projectRoot, tokenMap, skillId) {
  const pathErrors = [];
  const missingRefs = [];
  const missingLaunchers = [];
  const missingScripts = [];

  for (const fileAbs of files) {
    let content;
    try {
      content = readUtf8(fileAbs);
    } catch {
      continue;
    }
    const sourceRel = toPosix(path.relative(projectRoot, fileAbs));

    // Markdown links
    for (const link of extractLinks(content)) {
      const target = link.target.trim();
      if (isUrlOrAnchor(target)) continue;
      if (isTrivialCitation(target) || target.startsWith('-')) continue;
      if (isTemplateOrGlobPath(target)) continue;
      if (/^\/[A-Za-z0-9_-]+$/.test(target)) continue; // /ws-tdah invoke names
      if (!looksLikeLinkTarget(target) && !/\{[A-Za-z0-9_-]+\}/.test(target)) continue;

      let linkTarget = target;
      if (/^ws-[a-z0-9-]+\//i.test(linkTarget) && !linkTarget.startsWith('.agents/')) {
        linkTarget = `${tokenMap.skillsRoot}/${linkTarget}`.replace(/\/+/g, '/');
      }

      const resolved = resolveCitedPath(linkTarget, fileAbs, projectRoot, tokenMap);
      if (resolved.kind === 'template') continue;
      if (isTemplateOrGlobPath(resolved.expanded)) continue;

      if (!resolved.exists) {
        const entry = {
          skillId,
          source: sourceRel,
          cited: target,
          expanded: resolved.expanded,
        };
        pathErrors.push(entry);
        // Companion-style refs (md/scripts) also go to missing references
        if (
          /\.(md|mdc|py|cjs|mjs|js|sh|json)$/i.test(resolved.expanded) ||
          /\/scripts\//.test(resolved.expanded)
        ) {
          missingRefs.push(entry);
        }
      }
    }

    // Brace / backtick path recipes
    for (const bt of extractBackticks(content)) {
      const val = bt.value;
      if (isTrivialCitation(val)) continue;
      if (!looksLikeBacktickPath(val) && !/\{[A-Za-z0-9_-]+\}/.test(val)) continue;
      if (isTemplateOrGlobPath(val)) continue;

      // Tool/script: flag missing launcher only for command-like invocations
      // (path + args, or script path used as argv0). Pure path citations are OK.
      if (isManagedScriptCitation(val, tokenMap)) {
        const trimmed = val.trim();
        const isCommandLike =
          /\s/.test(trimmed) && !/^(python|node|bash)\b/.test(trimmed);
        if (isCommandLike && !commandHasLauncher(trimmed)) {
          missingLaunchers.push({
            skillId,
            source: sourceRel,
            cited: val,
            issue: 'managed script invocation missing explicit python/node/bash launcher',
          });
        }

        const pathOnly = trimmed
          .replace(/^(python|node|bash)\s+/i, '')
          .trim()
          .split(/\s+/)[0];
        if (
          pathOnly &&
          !pathOnly.startsWith('-') &&
          !isTemplateOrGlobPath(pathOnly) &&
          (SCRIPT_EXT_RE.test(pathOnly) || /\{skillsRoot\}/.test(pathOnly))
        ) {
          const resolved = resolveCitedPath(pathOnly, fileAbs, projectRoot, tokenMap);
          if (resolved.kind === 'path' && !resolved.exists) {
            missingScripts.push({
              skillId,
              source: sourceRel,
              cited: pathOnly,
              expanded: resolved.expanded,
            });
            pathErrors.push({
              skillId,
              source: sourceRel,
              cited: pathOnly,
              expanded: resolved.expanded,
            });
          }
        }
      } else if (/\{[A-Za-z0-9_-]+\}/.test(val) || looksLikeBacktickPath(val)) {
        // Prefer whole token string; skip CLI flags / multi-arg command heads
        let pathCandidate = val.trim();
        if (/\s/.test(pathCandidate)) {
          // e.g. "--flag {us-dir}/file.md" → take first path-like token
          const tokens = pathCandidate.split(/\s+/);
          pathCandidate =
            tokens.find(
              (tok) =>
                !tok.startsWith('-') &&
                !isTrivialCitation(tok) &&
                (tok.includes('/') ||
                  tok.includes('{') ||
                  SCRIPT_EXT_RE.test(tok) ||
                  /\.(md|json)$/i.test(tok)),
            ) || null;
        }
        if (!pathCandidate || pathCandidate.startsWith('-')) continue;
        if (isTrivialCitation(pathCandidate)) continue;
        if (isUrlOrAnchor(pathCandidate)) continue;
        if (isTemplateOrGlobPath(pathCandidate)) continue;
        // Slash-command style (/ws-tdah) — not a filesystem path
        if (/^\/[A-Za-z0-9_-]+$/.test(pathCandidate)) continue;
        // Skill-relative companion cited from hub: ws-foo/FILE.md → skillsRoot
        if (/^ws-[a-z0-9-]+\//i.test(pathCandidate) && !pathCandidate.startsWith('.agents/')) {
          pathCandidate = `${tokenMap.skillsRoot}/${pathCandidate}`.replace(/\/+/g, '/');
        }

        const resolved = resolveCitedPath(pathCandidate, fileAbs, projectRoot, tokenMap);
        if (resolved.kind === 'template') continue;
        if (isTemplateOrGlobPath(resolved.expanded)) continue;
        if (resolved.kind === 'path' && !resolved.exists) {
          // Skill-folder prose (backtick) citations of docs/... often describe
          // the audited project's docs layout, not skill companions. Accept a
          // project-root match before reporting a missing path (markdown links
          // keep strict file-relative resolution).
          if (
            pathCandidate.startsWith('docs/') &&
            isCitingFromPublishedSkillFolder(fileAbs, projectRoot, tokenMap) &&
            exists(path.resolve(projectRoot, pathCandidate))
          ) {
            continue;
          }
          pathErrors.push({
            skillId,
            source: sourceRel,
            cited: pathCandidate,
            expanded: resolved.expanded,
          });
        }
      }
    }
  }

  return { pathErrors, missingRefs, missingLaunchers, missingScripts };
}

function markEmpty(value) {
  if (value === undefined || value === null) return { value: null, mark: 'missing' };
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return { value: '', mark: 'empty' };
    if (PLACEHOLDER_RE.test(t) || t.includes('<') && t.includes('>')) {
      return { value: t, mark: 'placeholder' };
    }
    return { value: t, mark: 'ok' };
  }
  return { value, mark: 'ok' };
}

function summarizeConfiguration(projectRoot, sharedDirAbs, configLoad, schemaLoad, tokenMap) {
  const configPath = path.join(sharedDirAbs, 'config.json');
  const tip =
    'user-gate: recommend running ws-configure-project to create/fill project hub config.json';

  if (!configLoad.ok || !configLoad.data) {
    return {
      available: false,
      path: toPosix(path.relative(projectRoot, configPath)),
      reason: configLoad.reason || 'missing',
      recommendation: tip,
      summary: null,
    };
  }

  const cfg = configLoad.data;
  const schemaIssues = [];
  if (schemaLoad && schemaLoad.ok && schemaLoad.data) {
    const schema = schemaLoad.data;
    const required = Array.isArray(schema.required) ? schema.required : [];
    for (const key of required) {
      if (cfg[key] === undefined) schemaIssues.push(`missing required top-level key: ${key}`);
    }
    const projReq =
      schema.properties &&
      schema.properties.project &&
      Array.isArray(schema.properties.project.required)
        ? schema.properties.project.required
        : ['name', 'baseBranch'];
    const project = cfg.project || {};
    for (const key of projReq) {
      if (project[key] === undefined || project[key] === null || String(project[key]).trim() === '') {
        schemaIssues.push(`project.${key} empty or missing`);
      }
    }
  } else if (schemaLoad && !schemaLoad.ok && schemaLoad.reason !== 'missing') {
    schemaIssues.push(`schema unreadable: ${schemaLoad.reason}`);
  }

  const project = cfg.project || {};
  const identity = {
    name: markEmpty(project.name),
    org: markEmpty(project.org),
    repoUrl: markEmpty(project.repoUrl),
    baseBranch: markEmpty(project.baseBranch),
    workingBranch: markEmpty(project.workingBranch),
  };

  const defaults = cfg.defaults || {};
  const switches = {};
  for (const k of DEFAULT_SWITCH_KEYS) {
    switches[k] = Object.prototype.hasOwnProperty.call(defaults, k)
      ? Boolean(defaults[k])
      : null;
  }
  const dca = defaults.deliveryCommitArtifacts || {};
  const deliveryCommitArtifacts = {};
  for (const k of DELIVERY_ARTIFACT_KEYS) {
    deliveryCommitArtifacts[k] = Object.prototype.hasOwnProperty.call(dca, k)
      ? Boolean(dca[k])
      : null;
  }

  const verification = cfg.verification || {};
  const verificationSummary = {};
  for (const [k, v] of Object.entries(verification)) {
    if (k.startsWith('_')) continue;
    verificationSummary[k] = markEmpty(v);
  }

  const rules = cfg.rules || {};
  const rulesSummary = {};
  for (const [k, v] of Object.entries(rules)) {
    if (k.startsWith('_')) continue;
    rulesSummary[k] = markEmpty(v);
  }

  return {
    available: true,
    path: toPosix(path.relative(projectRoot, configPath)),
    reason: null,
    recommendation: null,
    schemaAware: Boolean(schemaLoad && schemaLoad.ok),
    schemaIssues,
    summary: {
      pathTokens: {
        skillsRoot: tokenMap.skillsRoot,
        sharedDir: tokenMap.sharedDir,
        plansDir: tokenMap.plansDir,
        specsDir: tokenMap.specsDir,
        reviewsDir: tokenMap.reviewsDir,
        globalSkillsRoot: tokenMap.globalSkillsRoot,
      },
      identity,
      providers: cfg.providers || null,
      verification: verificationSummary,
      defaults: { ...switches, deliveryCommitArtifacts },
      invariants: cfg.invariants || null,
      fable: cfg.fable || null,
      rules: rulesSummary,
    },
  };
}

function dedupeFindings(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const k = keyFn(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

function buildReport(ctx) {
  const {
    pathErrors,
    toolDiagnostics,
    configuration,
    missingReferences,
    meta,
  } = ctx;

  return {
    tool: 'ws-doctor',
    readOnly: true,
    meta,
    sections: {
      pathErrors: pathErrors.length ? pathErrors : 'none',
      toolScriptDiagnostics: toolDiagnostics,
      configuration,
      missingReferences: missingReferences.length ? missingReferences : 'none',
    },
  };
}

function formatMarkdown(report) {
  const lines = [];
  lines.push('# ws-doctor report');
  lines.push('');
  lines.push(`- projectRoot: \`${report.meta.projectRoot}\``);
  lines.push(`- skillsRoot: \`${report.meta.skillsRoot}\``);
  lines.push(`- sharedDir: \`${report.meta.sharedDir}\``);
  if (report.meta.skillFilter) lines.push(`- skillFilter: \`${report.meta.skillFilter}\``);
  lines.push(`- skillsScanned: ${report.meta.skillsScanned}`);
  lines.push('');

  lines.push('## 1. Path errors');
  lines.push('');
  const pe = report.sections.pathErrors;
  if (pe === 'none') {
    lines.push('none');
  } else {
    lines.push('| Skill / hub | Source | Cited | Expanded |');
    lines.push('|-------------|--------|-------|----------|');
    for (const e of pe) {
      lines.push(
        `| ${e.skillId || '-'} | \`${e.source}\` | \`${e.cited}\` | \`${e.expanded}\` |`,
      );
    }
  }
  lines.push('');

  lines.push('## 2. Tool / script diagnostics');
  lines.push('');
  const td = report.sections.toolScriptDiagnostics;
  const ml = td.missingLaunchers || [];
  const ms = td.missingScripts || [];
  const pf = td.parseFailures || [];
  const sk = td.parseSkipped || [];

  if (!ml.length && !ms.length && !pf.length && !sk.length) {
    lines.push('none');
  } else {
    if (ml.length) {
      lines.push('### Missing launchers');
      lines.push('');
      for (const e of ml) {
        lines.push(`- [${e.skillId}] \`${e.source}\`: \`${e.cited}\` - ${e.issue}`);
      }
      lines.push('');
    }
    if (ms.length) {
      lines.push('### Missing cited scripts');
      lines.push('');
      for (const e of ms) {
        lines.push(`- [${e.skillId}] \`${e.source}\`: \`${e.cited}\` -> \`${e.expanded}\``);
      }
      lines.push('');
    }
    if (pf.length) {
      lines.push('### Parse failures');
      lines.push('');
      for (const e of pf) {
        lines.push(`- \`${e.path}\`: ${e.error}`);
      }
      lines.push('');
    }
    if (sk.length) {
      lines.push('### Parse skipped');
      lines.push('');
      for (const e of sk) {
        lines.push(`- \`${e.path}\`: ${e.error}`);
      }
      lines.push('');
    }
  }

  lines.push('## 3. Configuration');
  lines.push('');
  const cfg = report.sections.configuration;
  if (!cfg.available) {
    lines.push(`unavailable (${cfg.reason}) at \`${cfg.path}\``);
    lines.push('');
    lines.push(`Recommendation: ${cfg.recommendation}`);
  } else {
    lines.push(`config: \`${cfg.path}\` (schema-aware: ${cfg.schemaAware ? 'yes' : 'no'})`);
    if (cfg.schemaIssues && cfg.schemaIssues.length) {
      lines.push('');
      lines.push('Schema / identity issues:');
      for (const iss of cfg.schemaIssues) lines.push(`- ${iss}`);
    }
    const s = cfg.summary;
    lines.push('');
    lines.push('### Path tokens');
    lines.push('');
    for (const [k, v] of Object.entries(s.pathTokens)) {
      lines.push(`- \`{${k}}\` -> \`${v}\``);
    }
    lines.push('');
    lines.push('### Identity');
    lines.push('');
    for (const [k, v] of Object.entries(s.identity)) {
      lines.push(`- ${k}: ${JSON.stringify(v.value)} [${v.mark}]`);
    }
    lines.push('');
    lines.push('### Providers');
    lines.push('');
    lines.push('```');
    lines.push(JSON.stringify(s.providers, null, 2) || 'null');
    lines.push('```');
    lines.push('');
    lines.push('### Verification');
    lines.push('');
    for (const [k, v] of Object.entries(s.verification)) {
      lines.push(`- ${k}: ${JSON.stringify(v.value)} [${v.mark}]`);
    }
    lines.push('');
    lines.push('### Defaults switches');
    lines.push('');
    for (const k of DEFAULT_SWITCH_KEYS) {
      lines.push(`- ${k}: ${s.defaults[k]}`);
    }
    lines.push('- deliveryCommitArtifacts:');
    for (const [k, v] of Object.entries(s.defaults.deliveryCommitArtifacts)) {
      lines.push(`  - ${k}: ${v}`);
    }
    lines.push('');
    lines.push('### Invariants');
    lines.push('');
    lines.push('```');
    lines.push(JSON.stringify(s.invariants, null, 2) || 'null');
    lines.push('```');
    lines.push('');
    lines.push('### Fable');
    lines.push('');
    lines.push('```');
    lines.push(JSON.stringify(s.fable, null, 2) || 'null');
    lines.push('```');
    lines.push('');
    lines.push('### Rules paths');
    lines.push('');
    for (const [k, v] of Object.entries(s.rules)) {
      lines.push(`- ${k}: ${JSON.stringify(v.value)} [${v.mark}]`);
    }
  }
  lines.push('');

  lines.push('## 4. Missing references');
  lines.push('');
  const mr = report.sections.missingReferences;
  if (mr === 'none') {
    lines.push('none');
  } else {
    lines.push('| Skill / hub | Source | Cited | Expanded |');
    lines.push('|-------------|--------|-------|----------|');
    for (const e of mr) {
      lines.push(
        `| ${e.skillId || '-'} | \`${e.source}\` | \`${e.cited}\` | \`${e.expanded}\` |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    usage();
    process.exit(0);
  }

  const projectRoot = path.resolve(process.cwd());
  const projectSharedDir = resolveProjectSharedDir(projectRoot);
  const configPath = path.join(projectSharedDir, 'config.json');
  const schemaPath = path.join(projectSharedDir, 'config.schema.json');

  const configLoad = loadJson(configPath);
  const schemaLoad = loadJson(schemaPath);
  const config = configLoad.ok ? configLoad.data : null;

  const tokenMap = buildTokenMap(projectRoot, config);
  const skillsRootAbs = tokenMap._abs.skillsRoot;
  const sharedDirAbs = tokenMap._abs.sharedDir;

  const configuration = summarizeConfiguration(
    projectRoot,
    sharedDirAbs,
    configLoad,
    schemaLoad,
    tokenMap,
  );

  let skills = listSkillDirs(skillsRootAbs, args.skill);
  if (args.skill && skills.length === 0) {
    // Hybrid fallback: global skills root
    const globalRoot = tokenMap._abs.globalSkillsRoot;
    skills = listSkillDirs(globalRoot, args.skill);
    if (skills.length === 0) {
      console.error(`Error: skill not found: ${args.skill}`);
      process.exit(1);
    }
  }

  // Hub files (skipped when --skill limits to one package, except still useful? Plan: limit scan to one folder)
  const hubFiles = [];
  if (!args.skill) {
    const candidates = [
      path.join(projectRoot, 'AGENTS.md'),
      path.join(sharedDirAbs, 'AGENTS.md'),
      path.join(sharedDirAbs, 'tools.md'),
      path.join(sharedDirAbs, 'autoload.md'),
      path.join(sharedDirAbs, 'gates.md'),
      path.join(sharedDirAbs, 'setup.md'),
    ];
    for (const c of candidates) {
      if (isFile(c)) hubFiles.push(c);
    }
  }

  let pathErrors = [];
  let missingRefs = [];
  let missingLaunchers = [];
  let missingScripts = [];
  const parseFailures = [];
  const parseSkipped = [];

  for (const hub of hubFiles) {
    const scanned = scanPathAndRefs([hub], projectRoot, tokenMap, 'hub');
    pathErrors = pathErrors.concat(scanned.pathErrors);
    missingRefs = missingRefs.concat(scanned.missingRefs);
    missingLaunchers = missingLaunchers.concat(scanned.missingLaunchers);
    missingScripts = missingScripts.concat(scanned.missingScripts);
  }

  for (const skill of skills) {
    const mdFiles = collectMarkdownFiles(skill.dir);
    const scanned = scanPathAndRefs(mdFiles, projectRoot, tokenMap, skill.id);
    pathErrors = pathErrors.concat(scanned.pathErrors);
    missingRefs = missingRefs.concat(scanned.missingRefs);
    missingLaunchers = missingLaunchers.concat(scanned.missingLaunchers);
    missingScripts = missingScripts.concat(scanned.missingScripts);

    for (const scriptAbs of collectScriptFiles(skill.dir)) {
      const rel = toPosix(path.relative(projectRoot, scriptAbs));
      const result = parseCheckScript(scriptAbs);
      if (result.status === 'fail') {
        parseFailures.push({ path: rel, error: result.error });
      } else if (result.status === 'skipped') {
        parseSkipped.push({ path: rel, error: result.error });
      }
    }
  }

  pathErrors = dedupeFindings(
    pathErrors,
    (e) => `${e.skillId}|${e.source}|${e.cited}|${e.expanded}`,
  );
  missingRefs = dedupeFindings(
    missingRefs,
    (e) => `${e.skillId}|${e.source}|${e.cited}|${e.expanded}`,
  );
  missingLaunchers = dedupeFindings(
    missingLaunchers,
    (e) => `${e.skillId}|${e.source}|${e.cited}`,
  );
  missingScripts = dedupeFindings(
    missingScripts,
    (e) => `${e.skillId}|${e.source}|${e.cited}`,
  );

  const report = buildReport({
    pathErrors,
    toolDiagnostics: {
      missingLaunchers,
      missingScripts,
      parseFailures,
      parseSkipped,
    },
    configuration,
    missingReferences: missingRefs,
    meta: {
      generatedAt: new Date().toISOString(),
      projectRoot: toPosix(projectRoot),
      skillsRoot: tokenMap.skillsRoot,
      sharedDir: tokenMap.sharedDir,
      skillFilter: args.skill || null,
      skillsScanned: skills.map((s) => s.id),
    },
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(asciiSafe(formatMarkdown(report)));
  }
  if (args.persist) {
    const configured = typeof args.persist === 'string'
      ? args.persist
      : config?.plans?.diagnosticsDir || '.agents/plans/diagnostics';
    const directory = path.resolve(projectRoot, configured);
    const stamp = report.meta.generatedAt.replace(/[:.]/g, '-');
    const extension = args.json ? 'json' : 'md';
    const output = path.join(directory, `doctor-${stamp}.${extension}`);
    fs.mkdirSync(directory, { recursive: true });
    const content = args.json ? `${JSON.stringify(report, null, 2)}\n` : `${asciiSafe(formatMarkdown(report))}\n`;
    fs.writeFileSync(output, content, 'utf8');
    console.error(`Persisted ${toPosix(path.relative(projectRoot, output))}`);
  }
}

main();
