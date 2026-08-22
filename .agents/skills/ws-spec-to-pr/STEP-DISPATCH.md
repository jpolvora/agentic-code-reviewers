# Step dispatch (canonical)

**Sole source of truth** for **`ws-spec-to-pr` (standard)** step 0–9 dispatch actions, post-mutating merge notes, and Step 8/9 gate protocols. Load from `SKILL.md` only when advancing or dispatching a step. FSM, invariants, and gates overview stay in `SKILL.md`.

**Dual-mode (mandatory):** This file is **not** the lite step index. [`ws-spec-to-pr-lite`](../ws-spec-to-pr-lite/SKILL.md) keeps its own Steps 0–5 table. Shared gate/ship UX and artifact names stay in [`gates.md`](../ws-shared/gates.md) / [`config-resolution.md`](../ws-shared/config-resolution.md). Pipeline `ws-*` folders (folder == frontmatter `name:`; FSM steps stay 0–9 / Post) stay orch-agnostic: never assume full vs lite step numbers; orch passes `workflowType`, paths, and flags.

## Step instructions

> **Consistency:** the Skill map in `SKILL.md` (`ws-verify-plan` → Step 5, etc.) is authoritative. Keep this table aligned — never dispatch retired ids (`05-verify-sync-plan-us`, `implement-plan`, `plan-us`, …).

> **Subagent Model Switching:** The orchestrator session ALWAYS runs under the active session model (`currentModel`). When `config.json` → `defaults` defines phase model preferences, those preferences apply EXCLUSIVELY to subagents spawned via `dispatch-agent` (Steps 0–3 → `plannerModel`; Step 4 → `executionModel`; Steps 5–6 → `reviewerModel`; Step 7 → resolved test executor). The orchestrator resolves and passes the subagent phase model parameter during `dispatch-agent` and `--model` to `update_state.cjs`. **Step 7 resolve:** non-empty `defaults.testingModel` → else `defaults.executionModel` → else the active session model. Empty or omitted `testingModel` is valid (same as `executionModel`). On subagent switch failure or unconfigured model, gracefully fall back to `currentModel`.

| Step | Action | Artifact |
|------|--------|----------|
| 0 | Entry gate (user-gate). US/tracker provided → provider fetch snapshot → **prior-work sweep** (`sweep-prior-work` plus `node {skillsRoot}/ws-spec-to-pr/scripts/search_plan_history.cjs --slug {slug} --keyword <terms>`) recorded in `step-00`; surface matching completed local workflow artifacts. Then `dispatch-agent` `ws-write-spec` (reformulate & enhance to `{specsDir}/{slug}.spec.md` with agentic ACs + original human context) → register via `ws-local-spec-provider` into `{us-dir}/step-00-{slug}.spec.md`. No args → free-text → same local history sweep → `dispatch-agent` `ws-write-spec` → register. Existing `*.spec.md` → history sweep → register. Optional soft clarify if AC empty. | `{specsDir}/{slug}.spec.md` **then** `step-00-{slug}.spec.md` (after register) |

| 1 | Complexity gate → if simple: stub plan + skip to 4. Else `dispatch-agent` `ws-write-plan`; then `python {skillsRoot}/ws-spec-to-pr/scripts/check_memory_conflict.py {us-dir}/step-01-{slug}.plan.md --json` (exit 0 → proceed, including missing MEMORY.md consult-skipped; exit 2 → record trap titles in state/context to apply DO NOT / INSTEAD DO; exit 1 → HS-5 STOP for a missing plan file). | `step-01-{slug}.plan.md` |
| 2 | Conditional: skip if eligible; else `dispatch-agent` `ws-interview`; 2c End auto-confirms 2e | `step-02-{slug}.plan.refined.md` |
| 3 | `dispatch-agent` `ws-plan-to-tasks`; `defaults.enableDag: false` (default) forces `execMode: sequential` (sequential subagent tasks, no parallel DAG groups). `defaults.enableDag: true` evaluates `dagThresholds` for parallel DAG tasks. | `step-03-{slug}.plan.exec.md` + `step-03-{slug}.exec.dag.json` (both modes; DAG task groups only when parallel) |
| 4 | Pre-implement check: run `python {skillsRoot}/ws-spec-to-pr/scripts/check_memory_conflict.py {targetPlan} --json` (where `{targetPlan}` is `step-03-{slug}.plan.exec.md` if present, else `step-02-{slug}.plan.refined.md` or `step-01-{slug}.plan.md`; exit 0 → proceed, including missing MEMORY.md consult-skipped; exit 2 → pass trap DO NOT / INSTEAD DO guidance into subagent prompt; exit 1 → HS-5 STOP for a missing plan file); `dispatch-agent` `ws-implement-tasks` mode build (**defect-class repo-wide sweep** in skill); verify `pattern_consult`/`memory_consult` proof in step-output; branch-direct default | verification |

| 5 | `dispatch-agent` `ws-verify-plan` **quick-score default** vs refined spec ‖ spec; full matrix if score < 9 or `--strict`; **Regression Sabotage Check** when required (missing required → score **< 9**); **&lt;9 gate** (`scoreAndRefine` until ≥ 9); then **G2-code after Step 5 before Step 6** (skip if empty) | `step-05-{slug}.plan.report.md` |
| 6 | Fail-closed dirty preflight; `dispatch-agent` `ws-code-review` (`git diff {base}...HEAD`); Critical/Warning → **fix → re-review** via `ws-implement-tasks` (max 3; not a separate step); then G2-code of review fixes if dirty; soft model tip for stronger review LLM | `step-06-{slug}.review.md` (+ optional `.fix.report.md`) |
| 7 | Auto-skip if `skipTesting` or (no test surface + unit tests green); else `dispatch-agent` `ws-testing` (Testing). Inside Step 7, optional **mutation** substep runs only when `verification.mutationTest` is set and `defaults.skipMutationTesting` is false; skip (log) otherwise. When mutation skipped/unset, **regression sabotage** via `run_sabotage.py`. Mutation score &lt; `verification.mutationThreshold` (default 80) or runner non-zero → Step 7 **fail-closed** (no Advance to 8); hand off to `ws-implement-tasks` fix mode. FSM stays 0–9 (no new step). | `step-07-{slug}.testing.*` |
| 8 | Delivery result + **combined ship gate** ([`gates.md`](../ws-shared/gates.md)) → `ws-ship-pr` (`workflowMode: true`, `stopBeforeFixPr: true`). **`comment-issue`** on PR create when tracker id present; **`check-pr-status`** for CI triage. MEMORY sweep after delivery commit. | `step-08-{slug}.result.md` |
| 9 | `dispatch-agent` `ws-goal-fix-pr` (default) or `ws-fix-pr` (one-shot) after PR exists. CI fixes use **`check-pr-status`** only (baseline vs diff + one flake rerun). **`comment-issue`** on in-session merge when applicable. | PR threads / merge |

### Post-mutating transition (after step N completes)

**Order (mandatory):**

1. **`update_state.cjs`** — use `dispatch` before execution and `finish` after structured output; merge `files_touched`, record measured telemetry, and advance `currentStep`. Always pass `--jsonl-out {plansDir}/{slug}/telemetry/step-{NN}.jsonl` (zero-padded `NN`; lazy-create `telemetry/`). When `--skip-gates` or `config.json.invariants.skipQualityGates` is active, run its `bypass` operation.
2. **G2-code (Steps 5 and 6 only)** — After Step 5 (score ≥ 9): **G2-code after Step 5 before Step 6** (skip if empty stage). After Step 6 review-fix: one G2-code if product files remain. Algorithm and messages: [`gates.md`](../ws-shared/gates.md) § Required G2-code save points. Uncommitted workflow product files → **STOP**; do not dispatch `ws-code-review`. `dryRun` simulates only. Other steps: skip this item.
3. **Checkpoint** — `Shell` tag `uswf/{workflow-id}/before-step-{N+1}` @ HEAD **after** any G2-code (skip tag write in `dryRun`; log only). Pre-advance soft-passes missing tags when `dryRun: true`.
4. **Pre-advance validation** — **shell command** (not `dispatch-agent`):

```bash
node {skillsRoot}/ws-spec-to-pr/scripts/validate_state.cjs \
  {plansDir}/{slug}/{workflow-id}.state.md \
  --pre-advance {N+1}
```

On exit ≠ 0 → **HS-5**; **STOP** — no Progress Board, no Transition Gate, no dispatch to step N+1.

**Skip (pre-advance gate only):** When `--skip-gates` or `skipQualityGates` is active, **omit** step 4; log gate-bypass in JSONL (`type: gate-bypass`, `gate: pre-advance`, `reason: skip-gates|config`). Does **not** skip `update_state`, G2-code, checkpoint, build/test/security, or HS-1–HS-4.

5. **Progress Board** → **Transition Gate** → dispatch step N+1 (or auto-gate + dispatch in `autoMode`).

**Runtime audit (`defaults.enableAuditing`):** When effective `true`, after each step's `update_state` (before Transition Gate), append audit findings for script execution errors (non-zero exits, missing/unrecognized options, unhandled exceptions), tool/I/O/dispatch anomalies, performance bottlenecks, correctness risks, and disposable scratch scripts observed during the step via [`ws-audit`](../ws-audit/SKILL.md). At workflow end (after Step 8 delivery result, Step 9 fix-PR, or on failure), finalize the audit log and run the upstream GitHub issue / suggestion gates when `has-errors` or `has-suggestions` is true.

### Step 5 — Check-implementation (score gate)

Eval implemented code vs **refined spec when present, else `step-00-{slug}.spec.md`**. Publish integer **score 0–10** in Progress Board + report.

When `defaults.parallelVerifyReview` is `true`, first run G2-code after Step 4 and pin that immutable commit. Dispatch Steps 5 and 6 concurrently as read-only product-tree reviewers; each may write only its own workflow report and neither may write state, ledger, or product files. After both finish, the orchestrator runs `merge_verify_review.cjs`, which sorts findings by severity, path, line, id, and source, then links results serially. Any score gap or Warning/Critical enters one fix, re-verify, and re-review loop. The default remains `false`, preserving sequential Step 5 then Step 6.

When overall score is `< 9`, run `scoreAndRefine` even if `defaults.scoreAndRefine` is false. When `scoreAndRefine` mode is active (or triggered at bootstrap on completed workflows) **or** score is `< 9`:
- Evaluates each plan task in `step-01-{slug}.plan.md` on criteria fulfillment, code quality, edge-cases, and test coverage.
- Outputs `step-05-{slug}.score-analysis.md` containing task-by-task scores (0–10) and specific enhancement recommendations.
- **Optional (AC6):** When `step-05-{slug}.score-analysis.md` exists, re-invoke `ws-classify-complexity` with `--score-analysis` before the score gate — advisory only; does not block Advance.
- If overall score `< 9`: do **not** offer Accept Pass 1 As-Is. Re-dispatch `ws-implement-tasks` for tasks scoring `< 9`, then re-verify, until overall `≥ 9` (max 3 rounds; log `score-refine | round={n}/3`). After 3 rounds still `< 9`: Pause. Resume continues the loop.
- If overall score already `≥ 9` and `scoreAndRefine` flag: prompt **Pass 1 Score Analysis Gate** via `user-gate` (Option 1: Proceed with Second Pass Refinement; Option 2: Accept Pass 1 As-Is & Ship; Option 3: Selective Refinement). Option 1 or 3 re-dispatches `ws-implement-tasks` for flagged tasks.

| Score | Behavior |
|-------|----------|
| ≥ 9 | Complete step 5; **G2-code after Step 5 before Step 6** (skip if empty); then dispatch 6 |
| &lt; 9 | **scoreAndRefine** until ≥ 9 (max 3 rounds, then Pause). Never Advance or auto-approve below 9. Refine runs **before** the product commit. |

`autoMode`: auto-run scoreAndRefine rounds; do **not** auto-approve below 9 — Pause only after max rounds still < 9.

Contract: [`gates.md`](../ws-shared/gates.md) § Check-implementation gate and § Score & Refine gate.

### Step 6 — Code-review + fix → re-review loop (substep)

| Case | Behavior |
|------|----------|
| Clean (no Critical/Warning) | Complete step 6; skip review-fix G2-code; Advance to 7 |
| Critical/Warning findings | Fix → re-review rounds via `ws-implement-tasks` mode fix (max **3**); state/memory each round; Advance only when clean |
| After loop, product files remain | One **G2-code** commit for all fix rounds (`fix({slug}): code-review fixes`); then Advance |
| Residual after 3 rounds | **Pause** (fail closed) — do not Advance with open Critical/Warning |
| `autoMode` | Autofix (no ask); same max 3; Pause on residual; G2-code when stage set non-empty |

Fix is **not** its own `completedSteps` entry — log `review-fix | round={n}/3` in gate history. Contract: [`ws-code-review`](../ws-code-review/SKILL.md) § Fix → re-review loop. **Do not dispatch** review while uncommitted workflow product files remain.

### Step 8 — Ship (delivery + push/PR)

**Order:** [`protocols/delivery-result.md`](protocols/delivery-result.md) (writes `step-08-{slug}.result.md` **with Benchmark Total wall-clock time**) → render Step 8 final board Telemetry ([`progress-board.md`](protocols/progress-board.md)) → **combined delivery + ship user-gate** → on delivery commit: MEMORY sweep → optional Phase B plan-dir temp delete per [`protocols/artifact-cleanup.md`](protocols/artifact-cleanup.md).

**Phase A git cleanup:** If this Step 8 ends the workflow with `status → completed` (no Step 9 / skip-PR), run Phase A **once** before claiming ended (`python {skillsRoot}/ws-spec-to-pr/scripts/cleanup_workflow_git.py --workflow-id {workflow-id}`). If advancing to Step 9, defer Phase A until Step 9 sets `completed` — never run Phase A at both steps. Exit 0 proceed; exit 2 surface leftovers (may claim ended); exit 1 do not claim ended.

When `scoreAndRefine` was executed, generate `step-08-{slug}.second-pass-report.md` comparing Pass 1 vs Pass 2 scores, LOC deltas, quality gains, and test metrics. Include Pass 1 vs Pass 2 comparative summary table in `step-08-{slug}.result.md`.

Telemetry/`--elapsed` still required under `autoMode`/`fullMode` (State Hygiene → HS-5 if missing).

**Combined gate** ([`gates.md`](../ws-shared/gates.md)):

1. **Commit configured delivery artifacts, then create PR** (Recommended when `fullMode`)
2. **Commit configured delivery artifacts, push only**
3. **Commit configured delivery artifacts, skip PR**
4. **Skip delivery commit and skip shipping**
5. **Pause**

G2-delivery stages only artifacts enabled by `defaults.deliveryCommitArtifacts` — see [`ARTIFACTS.md`](ARTIFACTS.md) § Step 8.

Dispatch `ws-ship-pr` with `workflowMode: true`, `shipAction`, `stopBeforeFixPr: true` — **no goal-fix loop inside ship**; orch Advance to 9 when PR created.
After delivery commit / PR creation, auto-run [`ws-spec-index`](../ws-spec-index/SKILL.md) `sync` with `{slug}` and `shipEvidence`.

### Step 9 — Fix-PR

After Step 8 when `shipAction: create-pr` and PR exists:

1. **Wait for code-review / CI feedback** (same policy as `ws-ship-pr` Step 6 settle: wait 30s post-PR creation for code-review action to start on GitHub infrastructure, then default 300s post-push heartbeats, then poll checks + threads). Do not merge yet.
2. Dispatch `ws-goal-fix-pr` (default loop) or `ws-fix-pr` (one-shot) until **no open issues to fix** (`activeThreads == 0`).
3. **Merge** via SCM provider `merge-pr` only after step 2 converges and required checks are green. Never merge with open review threads or failing required checks.

When setting `status → completed` after convergence (or equivalent terminal end), run **Phase A** git cleanup once before claiming ended — see [`protocols/artifact-cleanup.md`](protocols/artifact-cleanup.md). Do not also run Phase A at Step 8 when Step 9 ran.

Stop: max exhausted · escalate · merge blocked · cancelled · PR closed · checks red after convergence attempts.
