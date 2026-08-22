#!/usr/bin/env node
'use strict';

/**
 * ws-classify-complexity — threshold-based lite|standard pipeline recommendation.
 * No npm dependencies. Manual YAML frontmatter mini-parser (validate_state.py spirit).
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_THRESHOLDS = {
  maxImplementationSteps: 3,
  maxExpectedFiles: 6,
  maxLayers: 2,
};

const SCRIPT_DIR = __dirname;
const {
  resolveConsumerContext,
  toRepoRelative,
} = require(path.resolve(SCRIPT_DIR, '..', '..', 'ws-shared', 'scripts', 'resolve_consumer_root.cjs'));

function usage() {
  console.error(
    'Usage: node classify.cjs <spec-path> [--output-dir <dir>] [--score-analysis <path>]',
  );
}

function stripQuotes(val) {
  const s = String(val).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/** Minimal YAML frontmatter reader — flat keys + inline lists. */
function parseFrontmatter(fm) {
  const data = {};
  const lines = fm.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].replace(/\r$/, '');
    i += 1;
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();

    if (val.startsWith('[') && val.endsWith(']')) {
      const inner = val.slice(1, -1).trim();
      data[key] = inner
        ? inner.split(',').map((x) => stripQuotes(x.trim())).filter(Boolean)
        : [];
      continue;
    }

    if (val === '' || val === '|') {
      const block = [];
      while (i < lines.length && (/^\s/.test(lines[i]) || !lines[i].trim())) {
        block.push(lines[i]);
        i += 1;
      }
      data[key] = block.length ? block.join('\n') : val;
      continue;
    }

    data[key] = stripQuotes(val);
  }
  return data;
}

function splitFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }
  return { frontmatter: parseFrontmatter(match[1]), body: match[2] };
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`Warning: failed to parse ${filePath}: ${err.message}`);
    return null;
  }
}

function loadConfig(context) {
  const configPath = context.configPath;
  const examplePath = path.join(context.sharedDir, 'config.json.example');
  const config = context.config || loadJsonIfExists(examplePath) || {};
  const thresholds = { ...DEFAULT_THRESHOLDS, ...(config.dagThresholds || {}) };
  const scoreAndRefine = Boolean(config.defaults && config.defaults.scoreAndRefine);
  return {
    config,
    thresholds,
    scoreAndRefine,
    configSource: fs.existsSync(configPath) ? configPath : examplePath,
  };
}

function countSections(body) {
  const headers = body.match(/^##\s+.+$/gm) || [];
  return headers.length;
}

function countAcceptanceCriteria(body) {
  const acNumbers = new Set();
  const re = /\bAC(\d+)\b/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    acNumbers.add(m[1]);
  }
  if (acNumbers.size > 0) return acNumbers.size;

  const acSection = body.match(
    /##\s+Acceptance Criteria([\s\S]*?)(?=\n##\s+|\n#\s+|$)/i,
  );
  if (acSection) {
    return (acSection[1].match(/^-\s+/gm) || []).length;
  }
  return 0;
}

function countPathRefs(body) {
  const refs = new Set();
  const backtickRe = /`([^`\n]+)`/g;
  let m;
  while ((m = backtickRe.exec(body)) !== null) {
    const candidate = m[1].trim();
    if (!looksLikePath(candidate)) continue;
    refs.add(normalizePathRef(candidate));
  }
  return refs.size;
}

function looksLikePath(s) {
  if (!s || s.length > 260) return false;
  if (/\s/.test(s) && !s.includes('/')) return false;
  if (/^https?:\/\//i.test(s)) return false;
  return (
    s.includes('/') ||
    s.startsWith('.') ||
    /\.(md|json|js|cjs|ts|tsx|py|yml|yaml|sh|cs|csproj|slnx)$/i.test(s)
  );
}

function normalizePathRef(p) {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function countSpecLayers(body) {
  const layers = new Set();
  const layerHeadings = body.match(/^#{1,4}\s+Layer:\s*(.+)$/gim) || [];
  for (const heading of layerHeadings) {
    const name = heading.replace(/^#{1,4}\s+Layer:\s*/i, '').trim();
    if (name) layers.add(name.toLowerCase());
  }

  const layerTableRows = body.match(/^\|\s*Layer\s*\|[^\n]*\n\|[-\s|]+\|\n((?:\|[^\n]+\|\n?)+)/im);
  if (layerTableRows) {
    const rows = layerTableRows[1].split('\n').filter((r) => r.trim().startsWith('|'));
    for (const row of rows) {
      const cells = row.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length > 0 && !/^-+$/.test(cells[0])) {
        layers.add(cells[0].toLowerCase());
      }
    }
  }

  const layerMentions = body.match(/###\s+Layer:\s*([^\n]+)/gi) || [];
  for (const mention of layerMentions) {
    const name = mention.replace(/###\s+Layer:\s*/i, '').trim();
    if (name) layers.add(name.toLowerCase());
  }

  return layers.size;
}

function countConfigLayers(config) {
  const layers = config && config.stack && config.stack.backend && config.stack.backend.layers;
  if (!Array.isArray(layers)) return 0;
  const real = layers.filter((layer) => {
    if (!layer || typeof layer !== 'object') return false;
    const name = String(layer.name || '');
    const layerPath = String(layer.path || '');
    if (!name && !layerPath) return false;
    if (name.includes('<') || layerPath.includes('<')) return false;
    return true;
  });
  return real.length;
}

function parseArgs(argv) {
  const args = { specPath: null, outputDir: null, scoreAnalysis: null };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--output-dir') {
      args.outputDir = rest[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--score-analysis') {
      args.scoreAnalysis = rest[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      console.error(`Unknown option: ${arg}`);
      usage();
      process.exit(1);
    }
    if (!args.specPath) args.specPath = arg;
    else {
      console.error(`Unexpected argument: ${arg}`);
      usage();
      process.exit(1);
    }
  }
  return args;
}

function parseScoresFromAnalysis(content) {
  const scores = [];
  const patterns = [
    /(?:^|\s)(\d{1,2})\s*\/\s*10/g,
    /score\s*[:=]\s*(\d{1,2})/gi,
    /\|\s*T\d+\s*\|\s*(\d{1,2})\s*\|/gi,
    /\|\s*[^|]+\s*\|\s*(\d{1,2})\s*\|/g,
  ];

  for (const re of patterns) {
    let m;
    while ((m = re.exec(content)) !== null) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n >= 0 && n <= 10) scores.push(n);
    }
  }

  // Deduplicate consecutive duplicates from overlapping patterns (keep order)
  const deduped = [];
  for (const s of scores) {
    if (deduped.length === 0 || deduped[deduped.length - 1] !== s) {
      deduped.push(s);
    }
  }
  return deduped.length ? deduped : scores;
}

function scoreStats(scores) {
  if (!scores.length) {
    return { count: 0, mean: null, variance: null, min: null, max: null, lowCount: 0 };
  }
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance =
    scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
  const lowCount = scores.filter((s) => s < 9).length;
  return {
    count: scores.length,
    mean: Math.round(mean * 100) / 100,
    variance: Math.round(variance * 100) / 100,
    min: Math.min(...scores),
    max: Math.max(...scores),
    lowCount,
  };
}

function thresholdRecommendation(metrics, thresholds) {
  const within = {
    steps: metrics.implementationSteps <= thresholds.maxImplementationSteps,
    files: metrics.estimatedFiles <= thresholds.maxExpectedFiles,
    layers: metrics.layers <= thresholds.maxLayers,
  };
  const allWithin = within.steps && within.files && within.layers;
  return {
    pipeline: allWithin ? 'lite' : 'standard',
    within,
    allWithin,
  };
}

function applyScoreAnalysis(basePipeline, stats, thresholds, metrics) {
  if (!stats || stats.count === 0) {
    return {
      pipeline: basePipeline,
      adjusted: false,
      reason: 'No parseable scores in analysis file.',
    };
  }

  const highVariance = stats.variance !== null && stats.variance >= 2;
  const lowClusters = stats.lowCount >= 2;
  const uniformHigh =
    stats.mean !== null && stats.mean >= 8 && stats.variance !== null && stats.variance < 1.5;

  if (highVariance || lowClusters || stats.min < 6) {
    if (basePipeline === 'lite') {
      return {
        pipeline: 'standard',
        adjusted: true,
        reason:
          'Pass 1 score distribution shows high variance or low-score clusters — bias toward standard pipeline.',
      };
    }
    return {
      pipeline: 'standard',
      adjusted: false,
      reason: 'Score distribution confirms standard pipeline.',
    };
  }

  if (uniformHigh && metrics.implementationSteps <= thresholds.maxImplementationSteps + 1) {
    if (basePipeline === 'standard' && metrics.estimatedFiles <= thresholds.maxExpectedFiles) {
      return {
        pipeline: 'lite',
        adjusted: true,
        reason:
          'Uniform high Pass 1 scores with borderline step count — advisory lite reinforcement.',
      };
    }
  }

  return {
    pipeline: basePipeline,
    adjusted: false,
    reason: 'Pass 1 scores reviewed; threshold recommendation unchanged.',
  };
}

function inferSlug(specPath, frontmatter) {
  if (frontmatter.slug) return String(frontmatter.slug).trim();
  const base = path.basename(specPath, path.extname(specPath));
  const stepMatch = base.match(/^step-00-(.+)\.spec$/i);
  if (stepMatch) return stepMatch[1];
  return base.replace(/\.spec$/i, '');
}

function withinCell(ok) {
  return ok ? 'yes' : 'no';
}

function buildClassifyMarkdown({
  slug,
  title,
  recommendedPipeline,
  thresholdOnlyPipeline,
  scoreAdjusted,
  metrics,
  thresholds,
  within,
  configSource,
  scoreAndRefine,
  scoreSection,
  reasoning,
  executionProfile,
}) {
  const now = new Date().toISOString();
  const lines = [
    '---',
    `slug: ${slug}`,
    `recommendedPipeline: ${recommendedPipeline}`,
    `thresholdPipeline: ${thresholdOnlyPipeline}`,
    `classifiedAt: ${now}`,
    `scoreAndRefine: ${scoreAndRefine}`,
    '---',
    '',
    `# Pipeline Classification — ${title}`,
    '',
    '## Recommendation',
    '',
    `**Recommended pipeline:** \`${recommendedPipeline}\``,
    '',
    '| Orchestrator | When |',
    '|--------------|------|',
    '| `lite` | `ws-spec-to-pr-lite` — fast sequential Steps 0–5 |',
    '| `standard` | `ws-spec-to-pr` — full Steps 0–9 |',
    '',
    '## Execution profile',
    '',
    '| Decision | Value | Reason |',
    '|---|---|---|',
    ...Object.entries(executionProfile).map(([key, item]) => `| ${key} | \`${item.value}\` | ${item.reason} |`),
    '',
    '## Metrics',
    '',
    '| Metric | Count | Threshold | Within |',
    '|--------|-------|-----------|--------|',
    `| Implementation steps (ACs) | ${metrics.implementationSteps} | ${thresholds.maxImplementationSteps} | ${withinCell(within.steps)} |`,
    `| Estimated files (path refs) | ${metrics.estimatedFiles} | ${thresholds.maxExpectedFiles} | ${withinCell(within.files)} |`,
    `| Layers | ${metrics.layers} | ${thresholds.maxLayers} | ${withinCell(within.layers)} |`,
    `| Sections | ${metrics.sections} | — | — |`,
    '',
    '## Threshold comparison',
    '',
    `Source: \`${configSource.replace(/\\/g, '/')}\` → \`dagThresholds\``,
    '',
    `- maxImplementationSteps: ${thresholds.maxImplementationSteps}`,
    `- maxExpectedFiles: ${thresholds.maxExpectedFiles}`,
    `- maxLayers: ${thresholds.maxLayers}`,
    '',
    '**Rule:** recommend `lite` when **all** metrics are within limits; otherwise `standard`.',
    '',
    '## Reasoning',
    '',
    reasoning,
    '',
    '## scoreAndRefine analysis',
    '',
    scoreSection,
    '',
    '## Orthogonality note',
    '',
    'This artifact recommends `lite` | `standard` orchestrator choice only. The full-orch Complexity gate (`simple` | `standard` | `complex` in `gates.md`) is separate and still runs before Step 1 when using `ws-spec-to-pr`.',
    '',
    '## User gate (orchestrator)',
    '',
    '1. **Accept recommendation** (Recommended)',
    '2. **Override to standard**',
    '3. **Override to lite**',
    '',
    '`autoMode`: accept index 0. Mid-flight: if `lite` recommended while on standard orch, stay on current orch unless user explicitly overrides to lite.',
    '',
  ];

  if (scoreAdjusted) {
    lines.push('> Advisory: Pass 1 score analysis adjusted the threshold-only recommendation.', '');
  }

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.specPath) {
    usage();
    process.exit(1);
  }

  const context = resolveConsumerContext({ repoRoot: process.env.WS_REPO_ROOT || undefined, scriptFile: __filename });
  const specPath = path.resolve(context.repoRoot, args.specPath);
  if (!fs.existsSync(specPath)) {
    console.error(`Error: spec file not found: ${specPath}`);
    process.exit(1);
  }

  const content = fs.readFileSync(specPath, 'utf8');
  const { frontmatter, body } = splitFrontmatter(content);
  const slug = inferSlug(specPath, frontmatter);
  const title = frontmatter.title || slug;

  const { config, thresholds, scoreAndRefine, configSource } = loadConfig(context);

  const specLayers = countSpecLayers(body);
  const configLayers = countConfigLayers(config);
  const layers = Math.max(specLayers, configLayers, specLayers > 0 ? specLayers : 0);

  const metrics = {
    sections: countSections(body),
    implementationSteps: countAcceptanceCriteria(body),
    estimatedFiles: countPathRefs(body),
    layers: layers || (configLayers > 0 ? configLayers : specLayers),
  };

  if (metrics.layers === 0 && (body.includes('skills') || body.includes('cli') || body.includes('tests'))) {
    const layerKeywords = ['skills', 'cli', 'tests', 'bin', 'frontend', 'backend'];
    let hits = 0;
    for (const kw of layerKeywords) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(body)) hits += 1;
    }
    if (hits >= 2) metrics.layers = Math.min(hits, 4);
  }

  const thresholdResult = thresholdRecommendation(metrics, thresholds);
  let recommendedPipeline = thresholdResult.pipeline;
  let scoreAdjusted = false;
  let scoreSection;
  const reasoningParts = [];

  if (thresholdResult.allWithin) {
    reasoningParts.push(
      'All counted metrics are within `dagThresholds` — default recommendation is `lite`.',
    );
  } else {
    const exceeded = [];
    if (!thresholdResult.within.steps) exceeded.push('implementation steps (ACs)');
    if (!thresholdResult.within.files) exceeded.push('estimated files');
    if (!thresholdResult.within.layers) exceeded.push('layers');
    reasoningParts.push(
      `Exceeded threshold(s): ${exceeded.join(', ')} — default recommendation is \`standard\`.`,
    );
  }

  if (args.scoreAnalysis) {
    const analysisPath = path.resolve(context.repoRoot, args.scoreAnalysis);
    if (!fs.existsSync(analysisPath)) {
      console.error(`Warning: score-analysis file not found: ${analysisPath}`);
      scoreSection = 'deferred (score-analysis path provided but file missing)';
    } else {
      const analysisContent = fs.readFileSync(analysisPath, 'utf8');
      const scores = parseScoresFromAnalysis(analysisContent);
      const stats = scoreStats(scores);
      const scoreResult = applyScoreAnalysis(
        recommendedPipeline,
        stats,
        thresholds,
        metrics,
      );
      recommendedPipeline = scoreResult.pipeline;
      scoreAdjusted = scoreResult.adjusted;
      reasoningParts.push(scoreResult.reason);

      scoreSection = [
        'Pass 1 score distribution (from score-analysis artifact):',
        '',
        `| Stat | Value |`,
        `|------|-------|`,
        `| Task scores parsed | ${stats.count} |`,
        `| Mean | ${stats.mean ?? 'n/a'} |`,
        `| Variance | ${stats.variance ?? 'n/a'} |`,
        `| Min / Max | ${stats.min ?? 'n/a'} / ${stats.max ?? 'n/a'} |`,
        `| Low scores (<9) | ${stats.lowCount} |`,
        '',
        scoreResult.reason,
      ].join('\n');
    }
  } else if (scoreAndRefine) {
    scoreSection =
      'deferred (Pass 1 scores unavailable at Step 0). Re-invoke with `--score-analysis {us-dir}/step-05-{slug}.score-analysis.md` after Pass 1 when `scoreAndRefine` is enabled.';
  } else {
    scoreSection = 'not applicable (`scoreAndRefine` disabled in config).';
  }

  const outputDir = args.outputDir
    ? path.resolve(context.repoRoot, args.outputDir)
    : path.dirname(specPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const execMode = config.defaults?.enableDag === true && recommendedPipeline === 'standard' && !thresholdResult.allWithin ? 'dag' : 'sequential';
  const openQuestions = /##\s+Open Questions[\s\S]*?(?:^##\s+|$)/mi.test(body)
    && !/##\s+Open Questions\s*\n\s*(?:none|n\/a|-\s*\[x\])/i.test(body);
  const runInterview = recommendedPipeline === 'standard' && (metrics.layers > 2 || openQuestions);
  const runTesting = config.defaults?.skipTesting !== true;
  const aggregateFile = path.resolve(context.repoRoot, config.telemetry?.aggregateFile || path.join(config.plans?.dir || '.agents/plans', 'telemetry', 'aggregate.json'));
  const aggregate = loadJsonIfExists(aggregateFile);
  const storedEstimate = Number(aggregate?.medians?.[recommendedPipeline]?.runElapsedSec || 0);
  const estimatedElapsedSec = storedEstimate || (recommendedPipeline === 'standard' ? 900 : 300);
  const executionProfile = {
    pipeline: { value: recommendedPipeline, reason: reasoningParts.join(' ') },
    execMode: {
      value: execMode,
      reason: execMode === 'dag' ? 'DAG is enabled and the spec exceeds at least one configured threshold.' : 'DAG is disabled, the pipeline is lite, or all metrics fit the sequential threshold.',
    },
    runInterview: {
      value: runInterview,
      reason: runInterview ? 'Standard execution has open questions or more than two detected layers.' : 'No interview trigger was detected by the classifier; MEMORY may still force it later.',
    },
    runTesting: {
      value: runTesting,
      reason: runTesting ? 'Testing is enabled; the machine test-surface probe makes the final skip decision.' : 'Project defaults explicitly disable testing.',
    },
    estimatedElapsedSec: {
      value: estimatedElapsedSec,
      reason: storedEstimate ? 'Sourced from completed-run telemetry median.' : 'No stored median exists; using the published pipeline fallback.',
    },
  };
  const outPath = path.join(outputDir, `step-00-${slug}.classify.md`);
  const markdown = buildClassifyMarkdown({
    slug,
    title,
    recommendedPipeline,
    thresholdOnlyPipeline: thresholdResult.pipeline,
    scoreAdjusted,
    metrics,
    thresholds,
    within: thresholdResult.within,
    configSource: toRepoRelative(context.repoRoot, configSource, { allowOutside: true }),
    scoreAndRefine,
    scoreSection,
    reasoning: reasoningParts.join(' '),
    executionProfile,
  });

  fs.writeFileSync(outPath, markdown, 'utf8');

  const result = {
    status: 'success',
    recommendedPipeline,
    thresholdPipeline: thresholdResult.pipeline,
    scoreAdjusted,
    classifyPath: toRepoRelative(context.repoRoot, outPath, { allowOutside: true }),
    metrics,
    thresholds,
    executionProfile,
  };

  console.log(JSON.stringify(result, null, 2));
  console.log(`Wrote ${toRepoRelative(context.repoRoot, outPath, { allowOutside: true })}`);
}

main();
