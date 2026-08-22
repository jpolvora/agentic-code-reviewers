# Spec-to-PR

> **Human audience.** Orchestrator FSM lives in [`SKILL.md`](SKILL.md) — English agent contract. Use this README + [`DIAGRAM.md`](DIAGRAM.md) for onboarding. FAQ sections that still mention steps 11–13 are **legacy**; trust [`SKILL.md`](SKILL.md) / this README for steps **0–9**.
>
> **Current:** Standard FSM steps **0–9** (F0–F6). Pipeline skill folders `ws-*` (`ws-write-spec`…`ws-fix-pr`, `ws-goal-fix-pr`, `ws-update-plan-implementation`). Dual-mode with [`ws-spec-to-pr-lite`](../ws-spec-to-pr-lite/SKILL.md) (steps 0–5). Tools via [`tools.md`](../ws-shared/tools.md). Config: `.agents/skills/ws-shared/config.json`.
>
> **Identity:** `/ws-spec-to-pr`. Runtime tags: `uswf/`; plan slugs: `us-{id}`.

End-to-end Spec → PR pipeline using **orchestrator + sub-agents**, shared state, and confirmation gates (session model on each transition; switch via Pause → session host → Resume).

## Core Goals

1. **End-to-End Delivery:** Spec → plan → interview → implement → check → product commit → review → review-fix commit → testing → ship → fix-pr (steps **0–9**).
2. **Context Isolation:** Fresh `dispatch-agent` per step with bounded contracts, indexed plan slices, and matched MEMORY entries.
3. **Safety & Gates:** Explicit transitions; combined delivery+ship at Step 8; Fix-PR at Step 9.
4. **Portability:** Stack-agnostic; metadata from `config.json` / `STACK.md`.

| Document | Audience | Content |
|----------|----------|---------|
| **This README** | Humans + agents | Overview, phases, steps, flags |
| [`docs/faq.md`](docs/faq.md) | Humans | FAQ (partially legacy numbering — prefer SKILL for FSM) |
| [`SKILL.md`](SKILL.md) | **Agent (FSM)** | Contract, invariants, dispatch |
| [`DIAGRAM.md`](DIAGRAM.md) | Visual | Mermaid 0–9 / lite 0–5 |
| [`ARTIFACTS.md`](ARTIFACTS.md) | Both | Canonical filenames |

**Project entry:** [`ws-shared/AGENTS.md`](../ws-shared/AGENTS.md) (or root [`AGENTS.md`](../../../AGENTS.md) when authoring against the source repo).

---

## Phases (standard)

| Phase | Name | Steps | Notes |
|-------|------|-------|-------|
| **F0** | Bootstrap | 0 | Spec / providers / free-text |
| **F1** | Planning | 1–3 | Plan → interview → plan-to-tasks |
| **F2** | Implement | 4 | `ws-implement-tasks` build |
| **F3** | Check | 5 | Score 0–10 vs refined ‖ spec; ≥9 to Advance (`scoreAndRefine` until ≥9); then **required G2-code** of workflow product files |
| **F4** | Review | 6 | Code-review of committed diff vs base + **conditional fix** substep; then G2-code of review fixes if any |
| **F5** | Testing | 7 | `ws-testing` (skippable) |
| **F6** | Ship + Fix-PR | 8–9 | Combined delivery+ship; then fix-pr |

Lite: 0 Spec → 1 Plan → 2 Implement → G2-code → 3 Review → G2-code (fixes if any) → 4 Ship → 5 Fix-PR (no Testing / interview / DAG / check).

### Happy path

```text
/ws-spec-to-pr 2416
  → 0 Spec → 1 Plan → 2 Interview → 3 Tasks
  → 4 Implement → 5 Check (≥9 or scoreAndRefine until ≥9) → G2-code (verified implementation)
  → 6 Review (committed diff vs base; fix → re-review, max 3) → G2-code (review fixes if any)
  → 7 Testing
  → 8 Ship (delivery artifacts + push/PR) → 9 Fix-PR
```

Flags combinable, e.g. `full auto dry-run` — see [`setup.md`](../ws-shared/setup.md).

---

## How to start

```text
/ws-spec-to-pr 2338
/ws-spec-to-pr contoso/MyProject#2338
/ws-spec-to-pr ADO 2338
/ws-spec-to-pr specs/my-feature.spec.md
/ws-spec-to-pr dry-run 2338
/ws-spec-to-pr auto 2338
/ws-spec-to-pr auto dry-run full 2338
/ws-spec-to-pr auto skip-testing 2338
/ws-spec-to-pr auto skip-tests skip-testing 2338
/ws-spec-to-pr soft-delete for suppliers
```

State: `{plansDir}/us-{id}/{workflow-id}.state.md` (`dryRun`, `autoMode`, `skipTesting`, `skipTests`, `fullMode`, `scoreAndRefine`). Mutation opt-in is **config-only** (`defaults.skipMutationTesting` + `verification.mutationTest`) — not a state.md field.

### Flags

| Flag | Effect |
|------|--------|
| `auto` | Recommended option at every gate; no interactive menus |
| `dry-run` | Simulate; no commits/push/code edits/browser/`MEMORY` writes |
| `skip-testing` | Skip Step 7 Testing |
| `skip-tests` | Skip implement-time test suite runs (build still runs) |
| `full` | Step 8 Recommended = commit plan+result then create PR |
| `strict` | Full verification matrix at Step 5 |
| `score-and-refine` | Optional extra polish when Step 5 score is already ≥ 9 (aliases: `analyze-second-pass`, `score-refine`). Score `< 9` always runs this loop until ≥ 9 |

**Combined switches:** any mix supported (e.g. `full` + `auto` + `dry-run` for automated end-to-end dry-run). Documented in [`setup.md`](../ws-shared/setup.md).

### Model selection

The orchestrator session always executes under the active session model (`currentModel`). Subagent phase model preferences (`plannerModel`, `executionModel`, `reviewerModel`, `testingModel`) in `config.json` → `defaults` apply exclusively to subagents spawned via `dispatch-agent`. Manual switching of the orchestrator session via Pause → session host → Resume is supported when desired. Fallback to the active model if a subagent model switch fails.

### Evidence runtime

Node state helpers update the workflow atomically and publish deterministic `run.json`, `run.md`, plans-index, and JSONL telemetry artifacts. `plan.index.json` provides hash-checked plan slices. `ac-ledger.json` is the sole source of the derived verification score and links ACs to files, tests, commits, findings, Fable verdicts, and sabotage results.

---

## Steps (standard)

| # | Name | Skill / action | Objective |
|---|------|----------------|-----------|
| **0** | Spec | providers / `ws-write-spec` (+ register) | `{specsDir}/{slug}.spec.md` spec of record first, then workflow `step-00-{slug}.spec.md` after register |
| **1** | Plan | `ws-write-plan` | `step-01-{slug}.plan.md` |
| **2** | Interview | `ws-interview` | `step-02-{slug}.plan.refined.md` |
| **3** | Plan-to-tasks | `ws-plan-to-tasks` | exec + DAG |
| **4** | Implement | `ws-implement-tasks` | Code |
| **5** | Check-implementation | `ws-verify-plan` | Score 0–10; ≥9 to Advance (`scoreAndRefine` until ≥9); then required G2-code of workflow product files |
| **6** | Code-review | `ws-code-review` (+ fix → re-review, max 3) | Committed `{base}...HEAD`; then G2-code of review fixes if any |
| **7** | Testing | `ws-testing` | `step-07-{slug}.testing.*` |
| **8** | Ship | `ws-ship-pr` | Delivery artifacts + push/PR → `step-08-{slug}.result.md` (product already committed) |
| **9** | Fix-PR | `ws-fix-pr` / `ws-goal-fix-pr` | Threads → merge policy |

Post-workflow QA deltas: `ws-update-plan-implementation` (`ws-update-plan-implementation`).

### Step 7 — Testing (summary)

Unit + integration/E2E + coverage + feature-quality checks, plus optional **mutation testing** (kill/survive score vs `verification.mutationThreshold`) when `verification.mutationTest` is set and `defaults.skipMutationTesting` is false. Auto-skip whole step when `skipTesting` or no meaningful test surface and unit suite already green. Mutation failures fail-closed (no Advance to 8; fix tests via implement-tasks). Browser gated; skipped in auto/dry-run. Lite orch has no Step 7 — mutation is standard-only.

### Golden rule

After Transition Gate **Next**, dispatch the next step in the **same turn**. Universal controls: Next / Previous / Replay / Refine→Replay / Commit / Undo ([`gates.md`](../ws-shared/gates.md)).

---

## Git checkpoints

Local tags **never pushed**: `uswf/{workflow-id}/before-step-{N}`.

---

## Dual-mode

Same skills, `ws-shared/config.json`, `gates.md`. `workflowType`: `standard` | `lite` — no cross-resume. Lite has **no** Testing step.

---

## Related

- Lite orchestrator: [`ws-spec-to-pr-lite/SKILL.md`](../ws-spec-to-pr-lite/SKILL.md)
- Shared bootstrap: [`setup.md`](../ws-shared/setup.md)
- Step dispatch (standard only): [`STEP-DISPATCH.md`](STEP-DISPATCH.md)
- Dry-run FSM test runbook: [`ws-spec-to-pr-run-test.md`](ws-spec-to-pr-run-test.md)
