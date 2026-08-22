#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const HUB_REL = path.join('.agents', 'skills', 'ws-shared');
const HUB_CONFIG = path.join(HUB_REL, 'config.json');
const HUB_CONFIG_EXAMPLE = path.join(HUB_REL, 'config.json.example');

function inside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveGlobalSkillsRoot() {
  return path.resolve(process.env.WORKFLOW_SKILLS_GLOBAL_DIR || path.join(os.homedir(), '.agents', 'skills'));
}

function consumerHubExists(repoRoot) {
  const root = path.resolve(repoRoot);
  return fs.existsSync(path.join(root, HUB_CONFIG)) || fs.existsSync(path.join(root, HUB_CONFIG_EXAMPLE));
}

function resolveRepoRoot(override, { scriptFile } = {}) {
  if (override) return path.resolve(override);
  const cwd = path.resolve(process.cwd());
  if (consumerHubExists(cwd)) return cwd;

  if (scriptFile && !inside(scriptFile, resolveGlobalSkillsRoot())) {
    let candidate = path.resolve(scriptFile);
    for (let depth = 0; depth <= 4; depth += 1) candidate = path.dirname(candidate);
    if (consumerHubExists(candidate)) return candidate;
  }
  return cwd;
}

function sharedDir(repoRoot) {
  const explicit = process.env.WORKFLOW_SKILLS_SHARED_DIR;
  return path.resolve(explicit || path.join(resolveRepoRoot(repoRoot), HUB_REL));
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

function normalizeConfig(config) {
  const normalized = { ...config, fable: { ...(config.fable || {}) } };
  const value = normalized.fable.auditVerdictsBlockShip;
  if (value === undefined || value === null || value === true) normalized.fable.auditVerdictsBlockShip = 'refuted';
  else if (value === false || value === 'refuted' || value === 'caveats') normalized.fable.auditVerdictsBlockShip = value;
  else throw new Error('fable.auditVerdictsBlockShip must be false, "refuted", or "caveats"');
  return normalized;
}

function resolveConsumerContext({ repoRoot, scriptFile, skillId } = {}) {
  const root = resolveRepoRoot(repoRoot, { scriptFile });
  const localSkillsRoot = path.join(root, '.agents', 'skills');
  const globalSkillsRoot = resolveGlobalSkillsRoot();
  const localSkill = skillId ? path.join(localSkillsRoot, skillId) : localSkillsRoot;
  const skillsRoot = fs.existsSync(localSkill) ? localSkillsRoot : globalSkillsRoot;
  const hub = sharedDir(root);
  const localConfig = path.join(hub, 'config.json');
  const localExample = path.join(hub, 'config.json.example');
  const globalConfig = path.join(globalSkillsRoot, 'ws-shared', 'config.json');
  const globalExample = path.join(globalSkillsRoot, 'ws-shared', 'config.json.example');
  const configPath = [localConfig, localExample, globalConfig, globalExample].find((file) => fs.existsSync(file)) || localConfig;

  return {
    repoRoot: root,
    skillsRoot,
    sharedDir: hub,
    globalSkillsRoot,
    configPath,
    configSource: inside(configPath, root) ? 'project' : 'global',
    config: normalizeConfig(loadJson(configPath)),
  };
}

function resolveConfiguredPath(repoRoot, value, fallback) {
  const raw = String(value || fallback || '');
  return path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(repoRoot, raw);
}

function toRepoRelative(repoRoot, value, { allowOutside = false } = {}) {
  const absolute = path.resolve(value);
  if (!inside(absolute, repoRoot)) {
    if (!allowOutside) throw new Error(`Path is outside repository: ${value}`);
    return path.basename(absolute).replace(/\\/g, '/');
  }
  return path.relative(path.resolve(repoRoot), absolute).replace(/\\/g, '/') || '.';
}

function reportResolved(context) {
  return {
    repoRoot: '.',
    skillsRoot: toRepoRelative(context.repoRoot, context.skillsRoot, { allowOutside: true }),
    sharedDir: toRepoRelative(context.repoRoot, context.sharedDir, { allowOutside: true }),
    globalSkillsRoot: context.globalSkillsRoot.replace(/\\/g, '/'),
    configPath: toRepoRelative(context.repoRoot, context.configPath, { allowOutside: true }),
    configSource: context.configSource,
  };
}

module.exports = {
  HUB_REL,
  HUB_CONFIG,
  HUB_CONFIG_EXAMPLE,
  inside,
  resolveGlobalSkillsRoot,
  consumerHubExists,
  resolveRepoRoot,
  sharedDir,
  resolveConsumerContext,
  resolveConfiguredPath,
  toRepoRelative,
  reportResolved,
  normalizeConfig,
};
