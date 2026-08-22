---
name: ws-classify-complexity
description: Pipeline complexity classifier — analyzes a spec against config.json dagThresholds and recommends ws-spec-to-pr-lite or ws-spec-to-pr (standard).
version: 0.3.30
invocation_names:
  - classify-complexity
  - ws-classify-complexity
---

# ws-classify-complexity

> When this skill is loaded, output "ws-classify-complexity loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Analyze a feature spec and emit a reasoned execution profile for pipeline, execution mode, interview, testing, and estimated elapsed time. Writes `{us-dir}/step-00-{slug}.classify.md`.

**Specs family:** Role = orch chooser after a workflow `step-00` exists (or classify a `{specsDir}` file once registered). Used by Step 0 and [`ws-multi-spec`](../ws-multi-spec/SKILL.md). Router: [`../ws-shared/autoload.md`](../ws-shared/autoload.md).

**Harness-neutral:** use portable aliases from [`../ws-shared/tools.md`](../ws-shared/tools.md). Thresholds / scoreAndRefine detail: [`references/THRESHOLDS.md`](references/THRESHOLDS.md).

## Orthogonality to Complexity gate

This skill recommends **orchestrator choice** (`lite` | `standard`). It is **orthogonal** to the full-orch **Complexity gate** in [`../ws-shared/gates.md`](../ws-shared/gates.md) (`simple` | `standard` | `complex`), which runs before Step 1 and controls whether Steps 1–2–3 are skipped.

| Axis | Values | When | Purpose |
|------|--------|------|---------|
| **Pipeline classifier** (this skill) | `lite` \| `standard` | Step 0 (after spec exists) or `--classify` | Pick `ws-spec-to-pr-lite` vs `ws-spec-to-pr` |
| **Complexity gate** ([`gates.md`](../ws-shared/gates.md)) | `simple` \| `standard` \| `complex` | Full orch before Step 1 | Skip or enforce plan / interview / DAG steps |

Do not merge the two axes. A `lite` recommendation does not imply `simple`; a `standard` recommendation does not imply `complex`.

## Invocation

Standalone:

```
/classify-complexity <spec-path> [--score-analysis <path>]
```

Workflow (Step 0): orchestrator runs after `step-00-{slug}.spec.md` exists and **before** advancing to Step 1.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<spec-path>` | required | Canonical `{us-dir}/step-00-{slug}.spec.md` |
| `--score-analysis` | none | Pass 1 artifact `step-05-{slug}.score-analysis.md` (AC6; unavailable at first Step 0 classify) |
| `--output-dir` | spec parent dir | Override classify.md destination |

Script (explicit launcher per `tools.md`):

```bash
node {skillsRoot}/ws-classify-complexity/scripts/classify.cjs <spec-path> [--output-dir <dir>] [--score-analysis <path>]
```

## Steps

1. **Resolve paths** — Expand `{skillsRoot}`, `{sharedDir}`, `{plansDir}` from project `{sharedDir}/config.json` (Entry check above; use `config.json.example` only as last-resort template with an explicit log). Input spec must exist; script exits non-zero if missing.
   - Done when: spec path and slug are known.

2. **Run classifier** — Invoke `classify.cjs`. It:
   - Parses spec frontmatter (manual mini-parser; no npm YAML deps)
   - Counts sections (`##`), acceptance criteria (`AC\d+` / Acceptance Criteria bullets), unique backtick path refs, and layer signals (spec `### Layer:` headings + configured `stack.backend.layers`)
   - Loads `dagThresholds` from `{sharedDir}/config.json`, falling back to `config.json.example`
   - Optionally reads `--score-analysis` when Pass 1 scores exist (`scoreAndRefine`)
   - Writes `step-00-{slug}.classify.md` with recommendation, metrics table, threshold comparison, and reasoning
   - Done when: classify artifact exists on disk.

3. **Present user gate** — Show the complete `pipeline`, `execMode`, `runInterview`, `runTesting`, and `estimatedElapsedSec` profile with each reason. Unless `autoMode` or `--skip-gates` / `skipQualityGates` (quality gate only):

   | # | Option |
   |---|--------|
   | 1 | **Accept recommendation** (Recommended) |
   | 2 | **Override to standard** |
   | 3 | **Override to lite** |

   - `autoMode` / `user-gate-auto`: select index **0** (accept recommendation).
   - Log: `classify | recommended={lite|standard} | choice={accept|override-standard|override-lite} | ISO`.

4. **Apply choice** — Record `finalPipeline` in classify.md (or state) per gate outcome.
   - **Mid-flight advisory:** If already running `ws-spec-to-pr` and recommendation is `lite`, **stay on current orchestrator** unless the user explicitly chooses **Override to lite** (and orch supports handoff). Log `classify | lite-recommended | stay-standard-unless-override`. Never silently switch `workflowType` mid-flight.
   - Done when: `finalPipeline` is set and orch routes accordingly.

## scoreAndRefine & thresholds

See [`references/THRESHOLDS.md`](references/THRESHOLDS.md).

## Output artifact

`{us-dir}/step-00-{slug}.classify.md` — runtime artifact (not Step 8 delivery stage set). Registered in [`ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md) when wired.

## Related skills

- [`ws-multi-spec`](../ws-multi-spec/SKILL.md) — batch Smart Flow prefers this skill (or live `dagThresholds`) for lite vs standard selection.
- [`ws-plan-to-tasks`](../ws-plan-to-tasks/SKILL.md) — DAG sequential detection uses the same `dagThresholds` for plan size.
- [`ws-spec-to-pr`](../ws-spec-to-pr/SKILL.md) / [`ws-spec-to-pr-lite`](../ws-spec-to-pr-lite/SKILL.md) — orchestrators wire Step 0 classify and `--classify` flag.

## step-output

Return YAML:

```yaml
step-output:
  status: success|failed
  recommendedPipeline: lite|standard
  finalPipeline: lite|standard
  executionProfile: "{pipeline, execMode, runInterview, runTesting, estimatedElapsedSec; each value has a reason}"
  classifyPath: "{us-dir}/step-00-{slug}.classify.md"
  notes: "..."
```
