# Delivery Result Protocol (Step 8)

Before combined delivery+ship gate. `dryRun`: simulate result + plan edits + benchmark; no real commit.

## Steps

1. **`Read`** sources: `step-00-{slug}.spec.md`, `step-02-{slug}.plan.refined.md` (or `step-01-{slug}.plan.md` if Step 2 bypassed), `step-05-{slug}.plan.report.md`, `step-06-{slug}.review.md` (+ fix report if exists), `step-07-{slug}.testing.report.md` if exists, `## Open items` in state.
2. **`Write`** `{us-dir}/step-08-{slug}.result.md`:

```markdown
# {slug} — Delivery Result

## Expected
<!-- from spec ACs + plan scope -->

## Done
<!-- from verify report + review + testing + completed DAG tasks -->

## Next steps
<!-- open items, reservations, manual follow-ups before PR -->

## References
- Spec: {specPath}
- Plan: step-02-{slug}.plan.refined.md (or step-01-{slug}.plan.md if Step 2 was bypassed)
- Check: step-05-{slug}.plan.report.md
- Review: step-06-{slug}.review.md
```

3. **Capture LOC delta** (`Shell` from repo root):
   - Baseline: `git ls-files src/ web/ tests/ | xargs git show {baselineCommit}: 2>/dev/null | wc -l`
   - Final: `git ls-files src/ web/ tests/ | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}'`
   - Diff: `git diff --stat {baselineCommit} -- src/ web/ tests/ | tail -1` → parse added/removed → `telemetry.loc`
4. **Compute benchmark:** sum `telemetry.steps[].elapsedSec` (treat `null` as 0) → `totalElapsedSec`; sum tokens → `totalTokens`; `netDelta = added - removed`. Persist into state `telemetry`.
5. **Append Benchmark** (template below) to `step-08-{slug}.result.md`. **Mandatory** in `autoMode` / `fullMode` — do not replace with a Mode/Commits-only table.
6. **Render Step 8 final board** Telemetry block from [`progress-board.md`](progress-board.md) (Total time + tokens + LOC). Same for auto.
7. **Update plan checkmarks:** `[x]` per verify report + `completedTasks` + `completedSteps` ≥4.
8. Register `resultSnapshot` + `telemetry.workflowEndedAt` in state `## Artifacts`.
9. **G2-delivery** (inside combined Step 8 gate) → resolve stage list from `defaults.deliveryCommitArtifacts` per [`ARTIFACTS.md`](../ARTIFACTS.md) § Step 8 → `git commit -m "docs({slug}): configured delivery artifacts"`.
10. Log `step-8-delivery-commit | {sha}` in `## Gate history` and `commits[]`.

**HS-5:** If any non-skipped completed step lacks a numeric `elapsedSec` in `telemetry.steps[]`, or Benchmark omits **Total wall-clock time**, STOP before final board / ship gate.

## Telemetry & benchmark

Gate time (user-gate waiting) excluded — agent execution time only.

| Event | Field |
|-------|-------|
| Workflow start | `telemetry.workflowStartedAt` |
| Step N dispatch/finish | `telemetry.steps[N].dispatchedAt` / `finishedAt` / `elapsedSec` |
| Workflow end | `telemetry.workflowEndedAt` |
| Total | `telemetry.totalElapsedSec` |

Tokens: LLM metadata or estimate chars/3.5 (`estimated: true`). Shell steps (8, 9): elapsed only; tokens=0.

LOC at bootstrap + Step 8:

```bash
git ls-files src/ web/ tests/ | xargs wc -l 2>/dev/null | tail -1
git diff --stat {baselineCommit} -- src/ web/ tests/ | tail -1
```

Fields: `telemetry.loc.baseline`, `.final`, `.added`, `.removed`, `.netDelta` (count `src/`, `web/`, `tests/` only).

### step-output telemetry contract

```yaml
step-output:
  telemetry:
    elapsedSec: {int}
    promptTokens: {int|null}
    completionTokens: {int|null}
    estimated: {boolean}
```

Missing telemetry → **HS-5**.

### Benchmark template (append to result)

**Required rows:** Total wall-clock time, Steps executed, Total tokens, LOC lines. Optional Mode/Commits rows may follow; they must not replace Total wall-clock time.

```markdown
## Benchmark

| Metric | Value |
|--------|-------|
| Total wall-clock time | {h}h {m}m {s}s ({totalElapsedSec}s agent execution) |
| Steps executed | {N} |
| Total tokens | {sum} (estimated: {bool}) |
| Lines added | +{added} |
| Lines removed | -{removed} |
| Net LOC delta | +{netDelta} |
| Baseline LOC | {baseline} |
| Final LOC | {final} |

### Step breakdown

| Step | Label | Model | Elapsed | Tokens (est.) | Files changed |
|------|-------|-------|---------|---------------|---------------|
| 0 | Spec | {model} | {elapsedSec}s | {tokens} | {n} |
```

Token efficiency: `tokens/loc`. Velocity: `loc/min`. Format `{h}h {m}m {s}s` from `totalElapsedSec` (omit zero units OK, e.g. `12m 5s`).
