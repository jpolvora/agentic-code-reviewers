# Spec-to-PR — Dry-Run Test

## Purpose

Verify the ws-spec-to-pr FSM executes without error in simulated mode, covering phases F0–F6 and steps **0–9** including `fullMode` ship + fix-pr.

## Test Spec

| Field | Value |
|-------|-------|
| **File** | `specs/test-workflow.spec.md` |
| **Slug** | `test-workflow` |
| **Change** | Add `test-workflow` row to AGENTS.md Layer 5 table |
| **Type** | Documentation-only, single-file edit |

## Prerequisites

1. **BOOTSTRAP** section in [`setup.md`](../ws-shared/setup.md) — ensure `.agents/skills/ws-shared/config.json` points at this repo. If absent, create one:

    ```json
    {
      "project": {
        "name": "workflow-skills",
        "baseBranch": "main",
        "workingBranch": "develop",
        "gitRemote": "origin"
      },
      "plans": {
        "dir": ".agents/plans",
        "specsDir": "specs",
        "worktreesDir": ".agents/plans/{slug}/worktrees"
      },
      "stack": {
        "id": "markdown-only",
        "description": "Documentation-only repo (markdown)",
        "srcDir": ".",
        "rules": {
          "stackFile": ".agents/skills/ws-shared/STACK.md"
        },
        "layers": [{ "name": "docs", "path": ".", "role": "skills, specs, docs" }]
      },
      "verification": {}
    }
    ```

   > **Note:** In `dry-run` mode, verification commands are never executed — an empty `verification` block suffices.
   > Canonical artifact names: [`ARTIFACTS.md`](ARTIFACTS.md).

2. **Git status clean** — no dirty files before test:
   ```bash
   git status --porcelain
   ```

3. **Contract self-check** (automated, no agent run):
   ```bash
   npm run tests -- --local
   ```
   This asserts self-overwrite guard, ARTIFACTS/schema presence, Layer 2 routing in AGENTS.md, install tree match, and `update` config preserve.

## Invocation

```text
/ws-spec-to-pr auto full dry-run specs/test-workflow.spec.md
```

### Flag breakdown

| Flag | Effect |
|------|--------|
| `auto` | Auto-selects every gate (no interactive menus) |
| `full` | Combined Step 8 ship Recommended = commit + create PR; Step 9 fix-pr may run |
| `dry-run` | Simulates all steps; no code edits, no commits, no push, no worktrees, no MEMORY.md writes |

## Expected Flow

| Step | Label | Expected action |
|------|-------|-----------------|
| **0** | Spec Creation | Skipped — spec file provided directly |
| **1** | Planning | Complexity gate; if simple → stub plan + jump to 4; else `ws-write-plan` |
| **2** | Plan Refinement | Conditional skip or `ws-interview` (End refinement auto-confirms 2e) |
| **3** | Execution Plan & DAG | `ws-plan-to-tasks` — sequential writes exec.md + dag.json (empty task groups) |
| **4** | Implementation | `ws-implement-tasks` mode build |
| **5** | Check-implementation | `ws-verify-plan` quick-score; `scoreAndRefine` until score ≥ 9 (auto pauses only after max rounds still &lt; 9); then simulate G2-code of workflow product files |
| **6** | Code Review (+ fix → re-review) | `ws-code-review` on committed `{base}...HEAD`; on Critical/Warning: fix → re-review max 3; simulate G2-code of review fixes if any; Pause on residual |
| **7** | Testing | May auto-skip (`skipTesting` / no surface); else `ws-testing` without browser |
| **8** | Ship | Delivery result + combined gate → simulate delivery-artifact commit + PR (`ws-ship-pr`; product already committed) |
| **9** | Fix-PR | `ws-goal-fix-pr` / `ws-fix-pr` when PR created (`full`) |

## Verification Points

After the workflow completes (`status: completed`), confirm:

### Artifacts created (under `{plansDir}/test-workflow/`)

| Artifact | Expected |
|----------|----------|
| `{workflow-id}.state.md` | Status: `completed`, `dryRun: true`, completed steps through 8 (and 9 if PR simulated) |
| `step-00-test-workflow.spec.md` | Copied from `specs/` |
| `step-01-test-workflow.plan.md` | Present |
| `step-02-test-workflow.plan.refined.md` | Present (or skipped if Step 2 bypassed) |
| `step-03-test-workflow.plan.exec.md` | Present (unless Simple path) |
| `step-03-test-workflow.exec.dag.json` | Present (both modes; task groups only when `execMode: parallel`) |
| `step-05-test-workflow.plan.report.md` | Present |
| `step-06-test-workflow.review.md` | Present |
| `step-06-test-workflow.fix.report.md` | Present only if fix substep ran |
| `step-07-test-workflow.testing.plan.md` | Present if Step 7 ran |
| `step-07-test-workflow.testing.report.md` | Present if Step 7 ran |
| `step-08-test-workflow.result.md` | Present (dry-run: simulated) |

### Files NOT modified

- `AGENTS.md` — must NOT have `test-workflow` row (dry-run)
- `MEMORY.md` — must NOT have changes (dry-run)
- No git commits on branch — `git log --oneline -5` shows no `uswf/` or `feat(test-workflow)` commits
- No worktrees — `git worktree list` shows only main worktree

### State file checks

```yaml
# From {workflow-id}.state.md
dryRun: true
autoMode: true
fullMode: true
status: completed
completedSteps: [0, 1, 2, 3, 4, 5, 6, 7, 8]  # + 9 when fix-pr completes
# Simple path / skipTesting may omit 1–3 and/or 7
telemetry:
  totalElapsedSec: <int>  # non-null
  loc:
    baseline: <int>
    final: null            # dry-run: no real LOC
```

### No git mutations

```bash
# Verify no commits were made
git log --oneline --all --grep="test-workflow" | head -5

# Verify no tags were pushed (tags should be local only)
git tag -l "uswf/*"
```

### Dry-run specific

- All banners prefixed with `[DRY-RUN]`
- No writes to `src/`, `web/`, or any source paths
- `MEMORY.md` changes logged in `## Doc consolidation log` only
- Step 8 benchmark: `final LOC: null`
- Step 8/9 PR: simulated, no real `gh pr create`

## Cleanup

After a **completed** (non-dry-run) workflow, orch runs mandatory **Phase A** git cleanup via `python {skillsRoot}/ws-spec-to-pr/scripts/cleanup_workflow_git.py --workflow-id {workflow-id}` ([`protocols/artifact-cleanup.md`](protocols/artifact-cleanup.md)) — tags/worktrees/branches under `uswf/{workflow-id}` are removed even when plan-dir temps are kept.

After this **dry-run** harness test, remove test artifacts manually (dry-run does not mutate git):

```bash
rm -rf {plansDir}/test-workflow/
git tag -l "uswf/test-workflow*" | xargs git tag -d
```

Or reuse for the next dry-run iteration (workflow auto-detects and resumes).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `.agents/skills/ws-shared/config.json` not found | Config not in skill directory | Create minimal config (see prerequisites) |
| Step 1/2 not skipped with simple spec | Dynamic Execution threshold not met | Expected — workflow still runs correctly, just slower |
| Step 7 tries browser | `dry-run` / `auto` not parsed | Confirm flags precede spec path |
| Step 8 PR not reached | `full` flag absent | Add `full` before spec path |
| Files written to disk despite dry-run | Dry-run assertion failed | Check `## Gate history` for `dryRun: true` — report as bug |
