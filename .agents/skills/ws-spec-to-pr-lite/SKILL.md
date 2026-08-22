---
name: ws-spec-to-pr-lite
version: 0.3.30
description: Fast Spec-to-PR (steps 0–5). Plan, implement, commit, review, ship. Trigger for lite/fast delivery.
disable-model-invocation: true
invocation_names:
  - spec-to-pr-lite
  - ws-spec-to-pr-lite
---

# Spec-to-PR Lite — Orchestrator

> When this skill is loaded, output "ws-spec-to-pr-lite loaded."

Sequential spec→ship orchestrator executing inline steps (0–5) using the same pipeline skills as [`ws-spec-to-pr`](../ws-spec-to-pr/SKILL.md). Do **not** use `STEP-DISPATCH.md` for lite step numbers.

**Specs family:** Role = single-feature **lite** Spec→PR. Same entry rules as standard for specs (`{specsDir}` draft → register; tracker fetch → `ws-write-spec` agentic reformulation → register). Downstream steps always read the enhanced local spec copy. Prefer when `ws-classify-complexity` recommends lite. Batch → [`ws-multi-spec`](../ws-multi-spec/SKILL.md). Router: [`../ws-shared/autoload.md`](../ws-shared/autoload.md).

Before Step 0, on-demand load [`setup.md`](../ws-shared/setup.md) for bootstrap (Feature branch gate: §5b; Resume pre-check vs `{integrationBranch}`: §4c).

## Native Tool Contract

Aliases: [`tools.md`](../ws-shared/tools.md). At **every step boundary** in normal mode: use `user-gate` with ≥2 options per [`gates.md`](../ws-shared/gates.md) (host structured-choice when available; markdown fallback); `autoMode` → auto-gate index 0; cancel → HS-1.

## Invariants & Mode Rules

1. **Isolation:** `workflowType: lite` — never cross-resume with `standard`.
2. **Execution:** Inline in main session (no subagent dispatch).
3. **State & Telemetry:** Run `node {skillsRoot}/ws-spec-to-pr-lite/scripts/update_state.cjs dispatch` before each inline step and `finish` afterward with `--jsonl-out {plansDir}/{slug}/telemetry/step-{NN}.jsonl`; elapsed time is derived from those timestamps and authored `--elapsed` is rejected. Missing telemetry → **HS-5**.
4. **Artifacts:** `step-00` spec · `step-01` plan · `step-08` result (shared names with standard).
5. **Commits & Cleanup:** Required **G2-code after Step 2 before Step 3**; second G2-code after Step 3 review-fix if product files remain (`commit-code`, path-scoped `files_touched` — [`gates.md`](../ws-shared/gates.md) § Required G2-code save points). Configured delivery artifacts at Step 4 G2-delivery (`defaults.deliveryCommitArtifacts` / [`ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md) § Step 8). On `status → completed`, follow [`artifact-cleanup.md`](../ws-spec-to-pr/protocols/artifact-cleanup.md) Phase A: `python {skillsRoot}/ws-spec-to-pr/scripts/cleanup_workflow_git.py --workflow-id {workflow-id}`.
6. **Auto Mode Models:** `ws-spec-to-pr-lite` dispatches no `dispatch-agent` subagents (Invariant 2); the session executes inline under `{currentModel}` without session model switching. Phase model preferences (`plannerModel` [Steps 0–1], `executionModel` [Step 2], `reviewerModel` (Step 3)) are resolved only for telemetry recording. Do **not** read or apply `defaults.testingModel` (standard Step 7 only).
7. **Fable & Score/Refine:** Optional `fable.enabled` (domain@1, judge@3, verify@4). Optional `scoreAndRefine` (task score 0–10 in `step-05`, 2nd pass report in `step-08`).
8. **Config Entry Check:** Verify local project `$PWD/.agents/skills/ws-shared/config.json`. If missing or unconfigured, prompt `user-gate` to run [`ws-configure-project`](../ws-configure-project/SKILL.md).
9. **Runtime audit:** When `defaults.enableAuditing` is `true`, follow [`ws-audit`](../ws-audit/SKILL.md) (init at bootstrap, append script execution errors/anomalies/performance/correctness/disposable scripts per step, finalize + upstream issue / suggestion gates at end). When `false`, skip.
10. **Patterns & MEMORY Consult:** In Steps 1, 2, and 3: if `defaults.patternsFrontend` is true, read `{sharedDir}/frontend.md` (or fallback to `{sharedDir}/frontend.md.template` if missing) and load `ws-patterns-frontend` before Web/UI edits; if `defaults.patternsBackend` is true, read `{sharedDir}/backend.md` (or fallback to `{sharedDir}/backend.md.template` if missing) and load `ws-patterns-backend` before backend edits; grep `{sharedDir}/MEMORY.md` for 3–8 plan/spec keywords before coding; record `pattern_consult` and `memory_consult` in step outputs.



## Steps 0–5 Index

| Step | Label | Skill / Action | Verifiable Exit Criteria (Done When) |
|------|-------|----------------|--------------------------------------|
| 0 | Spec | providers / `ws-write-spec` (+ register); **prior-work sweep** before plan/code | `{specsDir}/{slug}.spec.md` exists (enhanced via `ws-write-spec`) **and** `step-00-{slug}.spec.md` registered + classifier user-gate completed |

| 1 | Planning | `ws-write-plan` (design-intent git log for modifications) | `step-01-{slug}.plan.md` created & validated |
| 2 | Implementation | `ws-implement-tasks` (**defect-class repo-wide sweep**) | Code modified + build/tests pass (`config.json.verification`); then required G2-code (skip if empty) |
| 3 | Review | `ws-code-review` (+ fix; sibling modules beyond diff) | Committed `{base}...HEAD`; `step-06-{slug}.review.md` clean (0 Critical/Warning remaining; max 3 loops); then G2-code of review fixes if any |
| 4 | Ship | orch + `ws-ship-pr` (`check-pr-status` CI triage + **`comment-issue`** on create) | `step-08-{slug}.result.md` created + PR created/skipped per menu |
| 5 | Fix-PR | `ws-goal-fix-pr` / `ws-fix-pr` (`check-pr-status` baseline vs diff) | PR merged or zero active threads (`activeThreads == 0`) |

**No Step 5/7 verify or testing:** lite does not dispatch `ws-verify-plan` or `ws-testing`. **Regression sabotage** and **mutation testing** are **standard-orch Steps 5 and 7 only** — out of scope for lite.

## Post-Mutating Transition Sequence (Steps 0–4 → 1–5)

After completing step N (0..4), before step N+1:
1. **State Hygiene:** `update_state.cjs` dispatch/finish with file lists, structured `--gate-decision`, and `--jsonl-out`; use its `bypass` operation when `skipQualityGates`.
2. **G2-code after Step 2 before Step 3** (required; skip if empty stage). After Step 3 review-fix: G2-code if product files remain. Algorithm: [`gates.md`](../ws-shared/gates.md) § Required G2-code save points / [`tools.md`](../ws-shared/tools.md) `commit-code`. Fail-closed: uncommitted workflow product files → do not dispatch Step 3 `ws-code-review`. `dryRun` simulates only. Other steps: skip.
3. **Checkpoint:** `git tag uswf/{workflow-id}/before-step-{N+1}` @ HEAD **after** any G2-code.
4. **Pre-Advance CI:** Unless `skipQualityGates`, run `node {skillsRoot}/ws-spec-to-pr-lite/scripts/validate_state.cjs {plansDir}/{slug}/{workflow-id}.state.md --pre-advance {N+1}`. Exit code > 0 → **HS-5** (STOP). Does **not** skip G2-code.
5. **Progress Board:** Display board → transition gate → proceed to step N+1.

## Step 0 — Pipeline Classifier

After `step-00-{slug}.spec.md` exists and before Step 1:
1. Run [`ws-classify-complexity`](../ws-classify-complexity/SKILL.md) → writes `step-00-{slug}.classify.md`.
2. **User Gate** (unless `autoMode` or `skipQualityGates`): Accept recommendation (Recommended) · Override to standard · Override to lite.

## Quality Gate Bypass (`skipQualityGates`)

See [`gates.md`](../ws-shared/gates.md) § Quality gate bypass. Active via `--skip-gates` or `config.json` → `invariants.skipQualityGates`.

## Triggers

```
/ws-spec-to-pr-lite [flags] [US {issue_id} | {name}.spec.md | "description"]
```
