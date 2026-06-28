import { readFileSync, existsSync } from 'node:fs';
import type { ReviewerConfig } from '../config.js';
import type { DiffPromptSection } from '../git/diff-prompt.js';
import type { LocalReviewGitContext } from '../git/diff.js';
import { loadPromptModuleContents, selectPromptModuleIds } from './prompt-modules.js';
import {
  buildMcpPromptSection,
  prefetchMcpObservations,
  type McpObservation,
} from '../mcp/mcp-prompt.js';

export interface PromptContext {
  workItemContext: string;
  prDescriptionContext: string;
  existingReviewContext: string;
  rulesContext: string;
  diffSection: DiffPromptSection;
  diffStats: { fileCount: number; files: string[] };
  gitContext: LocalReviewGitContext;
  /** When set (e.g. parallel chunks), skips per-chunk MCP prefetch in buildAgentPrompt. */
  mcpObservations?: McpObservation[];
}

const CODE_REVIEW_SKILL = 'skills/CODE_REVIEW.md';

function loadFileContent(path: string, label: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Failed to load ${label}: ${path} — ${String(error)}`);
  }
}

function buildSkillSection(skillContent: string): string[] {
  return [
    '---',
    '',
    '# Project Harness',
    '',
    skillContent,
  ];
}

function buildDiffSection(diffSection: DiffPromptSection): string[] {
  if (diffSection.mode === 'empty' && !diffSection.content) {
    return [];
  }

  const modeLabel =
    diffSection.mode === 'full'
      ? 'complete unified diff'
      : diffSection.mode === 'per-file'
        ? `per file (${diffSection.includedFiles} included)`
        : 'summary';

  return [
    '---',
    '',
    '## PR Diff (pre-loaded)',
    '',
    `> Mode: **${modeLabel}**. Use this section in **Phase 1**; complement with \`read\`/\`grep\` in Phase 2.`,
    '',
    diffSection.content,
    '',
  ];
}

export function buildExecutionContext(config: ReviewerConfig, context: PromptContext): string[] {
  const sourceRef = context.gitContext.sourceBranch;
  const targetRef = context.gitContext.targetBranch;
  const diffRange = context.gitContext.diffRange;
  const diffScopeLabel = context.gitContext.includeUncommitted
    ? `${diffRange} + working tree (uncommitted vs HEAD)`
    : diffRange;

  const largePrNote =
    context.diffStats.fileCount > 20
      ? `\n> **Large PR (${context.diffStats.fileCount} files):** execute both phases on **all** eligible files — no shortcuts.\n`
      : '';

  const lines = [
    '---',
    '',
    `# Pipeline — ${config.projectName}`,
  ];

  if (largePrNote) {
    lines.push(largePrNote);
  }

  lines.push(
    '',
    '## Execution Context',
    '',
    `\`cwd\` = \`${config.repoRoot}\`. Diff and rules are already embedded below; use tools to expand context in Phase 2.`,
    '',
  );

  if (config.pullRequestId > 0) {
    lines.push(
      `- **Pull Request ID (Azure DevOps):** #${config.pullRequestId}`,
      `- **PR ID Source:** \`${config.pullRequestIdSource || 'unknown'}\``,
      `- **Warning:** do not confuse the PR ID with linked Work Item IDs (User Story/Task).`,
      '',
    );
  }

  lines.push(
    `- **Branch:** \`${sourceRef}\` → \`${targetRef}\``,
    `- **Diff range:** \`${diffScopeLabel}\``,
    `- **Stack:** \`${config.stack}\``,
    `- **Minimum score for threads (\`AGENTIC_CODE_REVIEWERS_SCORE_MIN\`):** **${config.scoreMin}** — include in \`reviews\` **only** findings with \`score ≥ ${config.scoreMin}\`; the runner discards the rest before creating threads (pipeline default: 6; CLI \`--score-min\` and env take precedence).`,
    `- **Eligible files:** ${context.diffStats.fileCount}`,
    context.diffStats.files.length > 0
      ? `- **List:** ${context.diffStats.files.slice(0, 30).join(', ')}${context.diffStats.files.length > 30 ? '...' : ''}`
      : '',
    `- **Include:** ${config.includePatterns.join(', ')}`,
    `- **Exclude:** ${config.excludePatterns.join(', ')}`,
    '',
  );

  if (context.rulesContext) {
    lines.push(context.rulesContext, '');
  }

  return lines;
}

function buildSeedTestSection(): string[] {
  return [
    '## Seed Test Mode (mandatory in this run)',
    '',
    '1. Read `scripts/cursor-reviewer/SEED-ISSUES.md` and `fixtures/seed/expected-scenarios.json`.',
    '2. Report each intentional defect in files `CursorReviewerSeed*` / `cursor-reviewer-seed*`.',
    '3. Do not discard findings just because of `Compile Remove` or missing Angular route.',
    '4. Each review: `suggestedFix`, score ≥ 5, scenario keywords.',
    '',
  ];
}

function buildTwoPhaseWorkflow(context: PromptContext, scoreMin: number): string[] {
  const diffRange = context.gitContext.diffRange;
  const hasEmbeddedDiff = context.diffSection.mode !== 'empty';
  const diffStep = hasEmbeddedDiff
    ? 'Use the **pre-loaded diff** above as the triage base.'
    : context.gitContext.includeUncommitted
      ? `Execute \`git diff ${diffRange}\` **and** \`git diff HEAD\` / untracked on eligible paths.`
      : `Execute \`git diff ${diffRange}\` on eligible files.`;

  const omittedNote =
    context.diffSection.omittedFiles > 0
      ? `\n   - **${context.diffSection.omittedFiles} file(s)** were left out of the embedded diff — read via tools before concluding.`
      : '';

  return [
    '## Two-Phase Analysis (mandatory — do not skip steps)',
    '',
    'Complete **Phase 1 entirely** before starting Phase 2. Do not publish any findings without going through both.',
    '',
    '### Phase 1 — Triage (candidate map)',
    '',
    'Objective: lean list of **hypotheses** anchored on modified lines — still **without** final verdict.',
    '',
    `1. ${diffStep}`,
    '2. Incorporate PR description, work items, and ADO threads (context below, if any).',
    `3. For each eligible file, identify modified lines with potential real issues.${omittedNote}`,
    '4. **Discard immediately:** nits, style, preferences, theoretical warnings without executable path, untouched pre-existing code.',
    '5. In `*.html`: ignore CSS/Tailwind/layout; candidate only security, permissions, bindings, and validations.',
    '6. Keep candidate only with concrete hypothesis of failure, regression, or rule violation.',
    '',
    '**Mental output of Phase 1:** list of candidates `(file, line, brief hypothesis)` — may be empty.',
    '',
    '### Phase 2 — Deep Investigation + Classification (mandatory per candidate)',
    '',
    'Objective: **prove or refute** each candidate with tools; only proven ones enter \`reviews\`.',
    '',
    '#### 2.1 — Load project criteria',
    '',
    'Read the **pre-mapped rules** (section above) and the skill: `.agents/skills/code-review/SKILL.md`.',
    '',
    '#### 2.2 — Expand context with tools (per candidate)',
    '',
    '| Layer | What to read (`read`, `grep`, `glob`, semantic search) |',
    '|--------|-----------------------------------------------------|',
    '| Modified file | Full file or symbols + adjacent segments |',
    '| Backend | Entity/DTO, AppService, `[Authorize]`, EF, `Domain.Shared` constants |',
    '| Frontend | Component, template, guards, `*abpPermission`, forms |',
    '| Tests | `test/**/*`, specs — existing coverage or material absence |',
    '| Consumers | Callers, end-to-end flow (API → service → UI) |',
    '| Project | Rules listed above, `docs/` when business rule |',
    '',
    '#### 2.3 — Mandatory Proof (document in `analysis`)',
    '',
    'To include in `reviews`, complete the 4 items with evidence from tools:',
    '',
    '1. **Evidence** — inspected files/symbols (list in `impactPaths`).',
    '2. **Scenario** — executable failure scenario: input/state that triggers the problem.',
    '3. **Protection** — why tests/validations/invariants **do not** cover (cite what you verified).',
    '4. **Discards** — alternative hypotheses considered and rejected.',
    '',
    'Did not complete all 4 → **do not include** in `reviews`.',
    '',
    '#### 2.4 — Classify and Filter',
    '',
    `> **Mandatory parameter of this execution — scoreMin = ${scoreMin}** (env \`AGENTIC_CODE_REVIEWERS_SCORE_MIN\` or \`--score-min\`; default 6). Findings with \`score < ${scoreMin}\` **never** enter \`reviews\` — the TypeScript gate discards before creating threads in the PR.`,
    '',
    '1. Assign `severity` and score according to the tables in the **System Prompt**.',
    `2. Apply publication filter: **score < ${scoreMin} → omit** (do not send in JSON); only \`fix-code\` or \`escalate\`.`,
    '3. Combine multiple findings on the same line into a single review.',
    '4. Fill in `comment` (friendly, no code); `suggestedFix` only if there is a clear surgical patch (otherwise `""`).',
    '',
    '### Phase 3 — Whack-a-Mole Prevention (Grouping and Generalization)',
    '',
    'For **each proven finding in Phase 2**, before emitting the final JSON: you MUST use `grep`/`glob` to look for sister occurrences of the same pattern in all eligible files of the diff.',
    '',
    '- Examples: missing `[Authorize]` on an endpoint → check other endpoints; `.Result`/`.Wait()` in a method → check others.',
    '- Group **all** occurrences of the same class in the `relatedOccurrences` array of the main review. **Do not** report only the first and leave the sisters for the next round — this breaks convergence.',
  ];
}

function buildVerdictAndAdoPolicy(scoreMin: number): string[] {
  return [
    '',
    '### Final Verdict',
    '',
    `1. Re-read each review against the publication filter (score ≥ ${scoreMin}, required fields, \`fix-code\`/\`escalate\`). Remove from the JSON any item below the threshold.`,
    '2. **Completeness:** confirm that you went through **all** eligible files and that each real and proven finding was included — do not reserve findings for future rounds (single-round convergence).',
    '3. **Do not duplicate** existing ADO/GitHub threads (context below), including the table of already resolved threads — do not re-raise a resolved issue without **new evidence** that it has returned.',
    '4. `resolvedThreads`: only if you **verified** via tools that the issue has been fixed.',
    '5. Clean PR: `"reviews": []`; `reviewSummary` can be `""` (the runner publishes a standardized success message — do not list issues in `reviewSummary`).',
    '6. Emit **only** the JSON block — no narrative outside of the JSON.',
  ];
}

export function buildAgentPrompt(config: ReviewerConfig, context: PromptContext): string {
  const systemPromptContent = loadFileContent(config.systemPromptPath, 'System Prompt');
  const codeReviewSkillContent = loadFileContent(config.skillPath, 'Skill CODE_REVIEW.md');

  let stackPromptContent = '';
  if (config.customPromptContent) {
    stackPromptContent = config.customPromptContent;
  } else if (config.stackPromptPath && existsSync(config.stackPromptPath)) {
    stackPromptContent = loadFileContent(config.stackPromptPath, `Stack Prompt (${config.stack})`);
  }

  const sections: string[] = [
    systemPromptContent,
    '',
    ...buildSkillSection(codeReviewSkillContent),
    '',
  ];

  if (stackPromptContent) {
    sections.push(
      '---',
      '',
      `# Specific Stack Recommendations (${config.stack})`,
      '',
      stackPromptContent,
      '',
    );
  }

  const moduleIds = selectPromptModuleIds(context.diffStats.files, config.promptModules ?? []);
  const moduleContents = loadPromptModuleContents(config.runnerRoot, moduleIds);
  if (moduleContents.length > 0) {
    sections.push(
      '---',
      '',
      '# Change-Type Directives',
      '',
      moduleContents.join('\n\n---\n\n'),
      '',
    );
  }

  const mcpObservations = context.mcpObservations ?? prefetchMcpObservations(config, context);
  const mcpSection = buildMcpPromptSection(config, mcpObservations);
  if (mcpSection) {
    sections.push('', mcpSection);
  }

  sections.push(
    ...buildExecutionContext(config, context),
    ...buildDiffSection(context.diffSection),
  );

  if (context.prDescriptionContext) {
    sections.push('', context.prDescriptionContext);
  }

  if (config.seedTest) {
    sections.push(...buildSeedTestSection());
  }

  sections.push(...buildTwoPhaseWorkflow(context, config.scoreMin), ...buildVerdictAndAdoPolicy(config.scoreMin));

  if (context.workItemContext) {
    sections.push('', context.workItemContext);
  }

  if (context.existingReviewContext) {
    sections.push('', context.existingReviewContext);
  }

  return sections.join('\n');
}
