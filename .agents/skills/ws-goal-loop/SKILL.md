---
name: ws-goal-loop
description: Generic convergence loop primitive — stateful loop engine providing sentinel management, heartbeat/settle timers, and re-check convergence control.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - goal-loop
  - ws-goal-loop
---

# ws-goal-loop

> When this skill is loaded, output "ws-goal-loop loaded."

Convergence loop skeleton. A **goal-orchestrator** loads this skill and binds success criteria, collect, and act.

```
Goal → collect+evaluate → [act → verify → report → wait]×N → done
```

## Parameters

| Parameter | Description |
|-----------|-------------|
| `PR_NUMBER` | Target PR |
| `SUCCESS_CRITERION` | Checkable expression (e.g. `activeThreads == 0`) |
| `MAX_ITERATIONS` | Hard stop (default **20**) |
| `defaults.convergence` | Shared `initialDelaySec`, `minPollSec`, `maxPollSec`, `backoff`, and `maxIterations` policy. No timer constant is authored by a caller. |
| `COLLECT_CMD` / `ACT_CMD` / `VERIFY_CMD` | Collect / act / verify commands |
| `DRY_RUN` | Skip push, resolve, destructive actions |
| `RUNTIME_DIR` | Sentinel dir (default `{us-dir}/.runtime`) |

## Sentinel

Project-local runtime only (never OS temp). Templates: [`TEMPLATES.md`](TEMPLATES.md).

| Rule | Detail |
|------|--------|
| One per session | Kill old PID before starting new |
| Track | `$RUNTIME_DIR/sentinel.pid` |
| Stop/abort | Kill + remove PID file |
| Wake regex | `^GOAL_LOOP_WAKE_<ID>` for `notify_on_output` |

## Goal contract guards (AC7–AC8)

Enforcement is **contract wording + orchestration-driver checks + evals** — no runtime loop engine (this skill is a contract skeleton).

| Guard | Contract |
|-------|----------|
| **Revision-guarded updates (AC7)** | A goal carries a `revision` that increments once per accepted update. Any update carrying a **stale revision** (does not match the current goal revision) **conflicts loudly and is never silently overwritten**: stop and surface the conflict to the caller instead of applying the stale value. Never take last-wins on a conflicting revision. |
| **Blocked verdict (AC8)** | A **blocked** goal verdict is allowed only after **>= 3 consecutive rounds** with the **same concrete reason**, never before. Record the concrete reason each round; if the reason changes, the consecutive-round count resets to 0. Fewer than 3 identical rounds → do not mark blocked; keep re-arming/evaluating. |
| **Resume re-arms objective (AC8)** | Resuming a goal (after pause/stop) **re-arms the objective** so the loop continues from the current state with the objective re-stated, and re-initializes the blocked-round counter. |
| **Runtime storage (AC7–AC8)** | Persist `$RUNTIME_DIR/revision` and `$RUNTIME_DIR/blocked-reason` each round (see [`TEMPLATES.md`](TEMPLATES.md)); revision increments once per accepted update; blocked reason tracks consecutive identical failure reasons for the >= 3-round escalate threshold. |

## Loop (Done when each stage completes)

1. **Collect + evaluate** — Run `COLLECT_CMD` vs `SUCCESS_CRITERION`. Met → final report, kill sentinel, stop. Fail → stop (no improvised APIs).
2. **Act** — One `ACT_CMD` round (sync → investigate → fix → validate → commit → resolve → push, or dry-run sim).
3. **Verify** — Fresh `VERIFY_CMD` / review / publish / resolve evidence. **3× identical failure** → stop and escalate.
4. **Report** — `$RUNTIME_DIR/round-<N>.md` per [`TEMPLATES.md`](TEMPLATES.md).
5. **Heartbeat** — After every fresh provider read, run `node {skillsRoot}/ws-goal-loop/scripts/convergence.cjs --input <provider-status.json> --round {N} --round-log <round.md>`. Zero active threads plus concluded successful required checks exits immediately without arming a timer. Running checks use `minPollSec`; queued or absent runs use `maxPollSec`; every round records observed CI state and chosen interval. Else re-collect at `n+1` or stop at configured `maxIterations`.
6. **Exit** — Criterion true · max iterations · user stop · escalation · collect failure.

## Stop conditions

| Condition | Action |
|-----------|--------|
| Criterion met | Final report + kill sentinel |
| User stop / escalate / max / collect fail | Kill sentinel; summarize blockers / remaining |

## Dry-run

When `DRY_RUN=true`: no push/resolve/destructive; log + reports + verify; **do not** arm sentinel — re-collect immediately.

## Dependencies

Reports/sentinel: [`TEMPLATES.md`](TEMPLATES.md) · Artifact registry: [`ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md)
