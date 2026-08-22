# Classification thresholds & scoreAndRefine

## scoreAndRefine (AC6)

| Phase | Behavior |
|-------|----------|
| **Step 0 / first classify** | Threshold-only recommendation. Classify artifact § scoreAndRefine = `deferred (Pass 1 scores unavailable at Step 0)`. |
| **After Pass 1** | Orchestrator may re-invoke with `--score-analysis {us-dir}/step-05-{slug}.score-analysis.md`. Script adds distribution (mean, variance, low-score clusters) and may adjust **advisory** recommendation. |
| **Mid-flight** | Updated recommendation is **advisory only** unless user re-gates. Do not silently change `workflowType`. |

Heuristic (when scores present): uniform high scores (mean ≥ 8, low variance) may reinforce `lite`; high variance or low-score clusters (task scores `< 9`) bias toward `standard`.

## Threshold source

[`config.json`](../../ws-shared/config.json) → `dagThresholds` (defaults in [`config.json.example`](../../ws-shared/config.json.example)):

| Key | Default | Compared metric |
|-----|---------|-----------------|
| `maxImplementationSteps` | 3 | AC / requirement count |
| `maxExpectedFiles` | 6 | Unique backtick path references |
| `maxLayers` | 2 | Spec layer headings + configured stack layers |

**Recommend `lite`** when **all** metrics are within limits; otherwise **`standard`**.

