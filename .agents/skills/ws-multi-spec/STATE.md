# `ws-multi-spec` — State Schema & Already-Implemented Probe

Canonical run state lives under `{plansDir}/ws-multi-spec/` (expand `{plansDir}` from `config.plans.dir`, default `.agents/plans`).

## Run ID

`{runId}` = `ms-{YYYYMMDDTHHMMSSZ}` (e.g. `ms-20260725T220000Z`).
State file: `{plansDir}/ws-multi-spec/{runId}.state.md`.

## State File Format

```markdown
---
workflowType: ws-multi-spec
runId: ms-20260725T220000Z
status: active
baseBranch: develop
dryRun: false
createdAt: "2026-07-25T22:00:00Z"
updatedAt: "2026-07-25T22:00:00Z"
specsDir: .agents/specs
---

# Multi-spec Runner — ms-20260725T220000Z

| # | slug | specPath | flowMode | status | prNumber | prUrl | reason | updatedAt |
|---|------|----------|----------|--------|----------|-------|--------|-----------|
| 1 | 01-docker-compose | .agents/specs/01-docker-compose.spec.md | lite | pending | | | | 2026-07-25T22:00:00Z |
| 2 | 02-user-auth | .agents/specs/02-user-auth.spec.md | standard | pending | | | | 2026-07-25T22:00:00Z |
```

### Field Definitions

| Field | Values / Notes |
|-------|----------------|
| Run `status` | `active` · `paused` · `completed` |
| `baseBranch` | Base branch recorded at run start (e.g. `develop` or `main`), used for worker sync and PR targets |
| Item `status` | `pending` · `in_progress` · `shipped` · `skipped` · `failed` |
| `flowMode` | `lite` (dispatches `ws-spec-to-pr-lite`) · `standard` (dispatches full `ws-spec-to-pr`) |
| `slug` | Basename of spec without `.spec.md` (stable id) |
| `specPath` | Repo-relative path to source `*.spec.md` |
| `reason` | Required when `skipped` or `failed` (e.g. `already-implemented`, error summary) |
| `prNumber` / `prUrl` | Set on PR creation and retained on `shipped` |

*Note on `shipped`:* An item is terminal `shipped` ONLY when the PR is fully merged (`merged: true`, `state: MERGED`) with 0 open review threads (`activeThreads: 0`). Open, unmerged PRs are non-terminal and must complete Phase 4b delivery convergence and PR merge before advancing to the next spec.

## Worker `step-output` Contract

Workers dispatched by `ws-multi-spec` must return a parseable `step-output` block in their final output:

```text
step-output:
  status: shipped|failed
  slug: {slug}
  flowMode: lite|standard
  prNumber: {n|null}
  prUrl: {url|null}
  merged: true|false
  activeThreads: {n}
  checksStatus: green|red|pending
  mergeCommit: {sha|null}
  evidence: {one-line cite}
```

Missing or unparseable output (or `merged: false` when PR exists) is treated as non-terminal, triggering Phase 4b convergence via `ws-goal-fix-pr` and `ws-ship-pr` merge.

## Already-Implemented Probe

Before evaluating flow mode or dispatching a worker, run the probe check:

| # | Check | Evidence | Action |
|---|-------|----------|--------|
| 1 | Item already terminal in state | `shipped` (with confirmed merge) or `skipped` in state table | Skip worker |
| 2 | Prior delivery result for slug | `Glob` `{plansDir}/{slug}/**/step-08-*.result.md` exists and cites merged PR / commit | Mark `skipped` + `reason: already-implemented` |
| 3 | SCM merged PR for slug | Provider `gh` / SCM list shows merged PR referencing slug / title | Mark `skipped` + `reason: already-implemented` |

If ambiguous (e.g., unmerged open PR or missing evidence), do **not** skip. Proceed to Phase 4b convergence gate or worker execution.

## Blank-List Scan

When invoked without args or state file:
1. Resolve `{specsDir}` from `config.plans.specsDir` (default `.agents/specs`).
2. `Glob` `{specsDir}/**/*.spec.md`.
3. Present `user-gate` multi-select list.
4. User selection establishes the run order.
5. If cancelled or empty, stop immediately (no state file created).

## Resume Policy

When loading an existing `{plansDir}/ws-multi-spec/*.state.md`:
1. Retain original queue ordering and assigned `flowMode`.
2. Load recorded `baseBranch` from state frontmatter (or auto-detect active base branch if missing).
3. Skip items marked `shipped` (with `merged: true` confirmed) or `skipped`.
4. Rows with open PRs (`merged: false` / unmerged) must re-enter Phase 4b convergence gate to run `ws-goal-fix-pr` and merge into `baseBranch`.
5. Resume execution at the first `pending`, `in_progress` (reset to `pending`), or `failed` item.
6. Before re-dispatching worker for a spec, sync feature branch with `baseBranch` (`git merge {baseBranch}` or `git rebase {baseBranch}`) to ensure all prior merged changes and base features are incorporated.
7. Immediately after any PR merge success (`state: MERGED`), pull the latest `baseBranch` before creating a new feature branch for the next spec.
