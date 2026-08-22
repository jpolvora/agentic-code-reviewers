---
name: ws-multi-spec
version: 0.3.30
description: Batch specs one by one. Classifies each spec and runs standard or lite. Trigger for multi-spec queues.
disable-model-invocation: true
invocation_names:
  - multi-spec
  - ws-multi-spec
---

# `ws-multi-spec` — Smart Multi-Spec Orchestrator

> When this skill is loaded, output "ws-multi-spec loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Sequential multi-spec batch delivery orchestrator with **smart complexity & flow auto-detection**.

**Specs family:** Role = master batch loop over `{specsDir}` (or explicit paths). Per spec: classify → `ws-spec-to-pr-lite` or `ws-spec-to-pr` worker → fix-pr → merge → next. Interactive pick-one → [`ws-spec-list`](../ws-spec-list/SKILL.md). Router: [`../ws-shared/autoload.md`](../ws-shared/autoload.md).

## Audience & Load

- **Master Orchestrator (this file):** Loop FSM + tool bindings + flow auto-detection.
- **Protocol & State:** [`PROTOCOL.md`](PROTOCOL.md) · [`STATE.md`](STATE.md).
- **Examples & Evals:** [`EXAMPLES.md`](EXAMPLES.md) · [`evals/evals.json`](evals/evals.json).
- **On-demand:** [`../ws-spec-to-pr/SKILL.md`](../ws-spec-to-pr/SKILL.md) · [`../ws-spec-to-pr-lite/SKILL.md`](../ws-spec-to-pr-lite/SKILL.md) · [`../ws-ship-pr/SKILL.md`](../ws-ship-pr/SKILL.md) · [`../ws-goal-fix-pr/SKILL.md`](../ws-goal-fix-pr/SKILL.md) · [`../ws-shared/tools.md`](../ws-shared/tools.md).

## Native Tool Contract

Aliases: [`../ws-shared/tools.md`](../ws-shared/tools.md). Params: `{sharedDir}/config.json`. Never narrate undone work. Master orchestrator never edits code directly — dispatches worker skills via `dispatch-agent`.

| Intent | Alias | Rule |
|--------|-------|------|
| Worker dispatch | `dispatch-agent` | `generalPurpose` or subagent; `description: "ws-multi-spec worker [{flowMode}] — {slug}"`; sequential execution |
| User gate | `user-gate` / `user-gate-auto` | Selection gate for blank scan; failure pause gate (Resume, Skip, Abort) |
| SCM / state probe | `Shell` | SCM query & file probes; parse worker `step-output` |
| State persistence | `write-to-file` | Update `{plansDir}/ws-multi-spec/{runId}.state.md` |

## Goals & Invariants

1. **Sequential Execution:** Exactly one spec worker active at a time.
2. **Base Branch Sync:** Record `baseBranch` in state file header. Before worker dispatch and after PR merge success, fetch & pull `baseBranch` via `git merge {baseBranch}` (default). Use `git rebase {baseBranch}` only when `config.json` / run flag requests rebase.
3. **Flow Auto-Detect:** Run [`ws-classify-complexity`](../ws-classify-complexity/SKILL.md). Select `ws-spec-to-pr-lite` when ≤3 steps / ≤6 files / ≤2 layers / frontmatter `complexity: low`; `ws-spec-to-pr` otherwise.
4. **End-to-End Closure per Spec:** Every PR must undergo `ws-goal-fix-pr` convergence (`activeThreads == 0`) and explicit SCM merge (`state: MERGED`) before dispatching next spec.
5. **Isolation & State:** Fresh worker context per spec; update `{plansDir}/ws-multi-spec/{runId}.state.md`.
6. **Pause on Failure:** No silent continue on worker error; prompt user gate (Resume, Skip, Abort).
7. **Runtime audit:** Child `ws-spec-to-pr` / `ws-spec-to-pr-lite` workers inherit project `defaults.enableAuditing`; when `true`, each worker follows [`ws-audit`](../ws-audit/SKILL.md) for its run.

## Triggers

```
/ws-multi-spec
/ws-multi-spec {specsDir}/13-runner.spec.md {specsDir}/14-editor.spec.md
/ws-multi-spec {plansDir}/ws-multi-spec/ms-20260725T220000Z.state.md
```

## Done when (run)

- Config entry check passed.
- Each selected spec worker completed with PR merged (`activeThreads == 0`, SCM `MERGED`) or user Skip/Abort recorded.
- State file `{plansDir}/ws-multi-spec/{runId}.state.md` updated for every outcome.
