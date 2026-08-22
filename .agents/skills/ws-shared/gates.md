# Shared Gate Contract — Dual-Mode

Canonical gate UX for [`ws-spec-to-pr`](../ws-spec-to-pr/SKILL.md) and [`ws-spec-to-pr-lite`](../ws-spec-to-pr-lite/SKILL.md).
Both orchestrators MUST follow this file so shared pipeline skills stay interchangeable.

Artifact paths: [`../ws-spec-to-pr/ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md).
Config: [`.agents/skills/ws-shared/config.json`](config.json) only — see [`config-resolution.md`](config-resolution.md).

---

## Dual-mode rules (mandatory)

| Rule | Detail |
|------|--------|
| **Shared skills are workflow-agnostic** | Pipeline `ws-*` skills (`ws-write-spec`…`ws-fix-pr`, `ws-goal-fix-pr`, `ws-update-plan-implementation`), providers, `ws-goal-loop` never assume full vs lite step numbers. Orch passes mode, paths, and flags. |
| **`workflowType`** | `standard` (full) or `lite`. Resume filters by type — never cross-resume. |
| **One combined delivery + ship ask** | Orchestrator presents the combined gate once at standard Step 8 / lite Step 4. [`ws-ship-pr`](../ws-ship-pr/SKILL.md) in workflow mode **executes** the chosen option — does **not** re-ask at user-gate. Standalone `/ship-pr` may ask. |
| **Fix-PR is separate** | Standard Step 9 / lite Step 5 — **not** inside ship. `ws-ship-pr` receives `stopBeforeFixPr: true`. |
| **Artifact names** | Delivery result is `step-08-{slug}.result.md` for **both** workflows. Plan is `step-01-{slug}.plan.md`. |
| **Step ranges** | Standard: Steps 0–9. Lite: Steps 0–5. |
| **Config** | Only `.agents/skills/ws-shared/config.json`. No `ws-spec-to-pr/config.json` / `ws-spec-to-pr-lite/config.json`. |
| **User gates** | Prefer native structured choice UI when available; markdown fallback when not; HS-1 on cancel. |

---

## User gates (`user-gate`)

Portable alias: `user-gate`. Gate placement follows `defaults.gateGranularity`; hard stops are unchanged.

1. Every normal-mode gate: use `user-gate` with ≥2 options; recommended first. Prefer the host's structured multiple-choice UI when available; map to portable `user-gate` vocabulary in logs.
2. If structured choice is unavailable → present the **same options** as a short markdown list; wait for user reply. Log: `user-gate-fallback | {gate} | ISO`.
3. Cancelled / dismissed → **HS-1** (STOP; re-present; never infer yes).
4. `autoMode` → no user-gate prompt; use orch auto-gate table (index 0).

**Orchestrator obligation:** both orchestrators resolve `defaults.gateGranularity` (`step` default, or `phase`). `step` runs `user-gate` at each step boundary. `phase` runs at most five blocking gates in a normal standard run: entry, plan approval, implementation approval, delivery, and fix-PR. Boundaries inside a phase advance after validation and state persistence without another blocking prompt. Hard stops, required save points, review findings, test failures, and safety checks never become implicit approvals.

---

## Universal step controls (every step boundary)

Both workflows expose the same control vocabulary at **every** step transition. Primary menu stays slim; extended controls live under **More options…**.

**Banner (always, before options):**

````text
Orchestrator session model: {currentModel} | Subagent phase model: {targetSubagentModel}
To use a different model for the orchestrator session: Pause → switch it in the session host → resume workflow.
````

The orchestrator session ALWAYS runs under the active session model (`{currentModel}`). If `config.json` → `defaults` defines phase model preferences (`plannerModel`, `executionModel`, `reviewerModel`, `testingModel`), resolve `{targetSubagentModel}` for the subagent spawned at Step N; otherwise `{targetSubagentModel}` defaults to `{currentModel}`. If unknown, use `unknown`. Log `model | step {N} | {name} | ISO`. On change vs prior state value, also log `model-change | step {N} | {old} → {new} | ISO`.

**Primary options (always shown):**

1. **Next** — Advance to Step N+1 (Recommended)
2. **More options…**

**Under More options…** (second user-gate only if user picked More):

| Control | Action |
|---------|--------|
| **Previous** | Go back to an earlier completed step (sub-menu by phase / step list) |
| **Replay** | Re-run the current step from its checkpoint |
| **Refine** | Alias → **Replay** (same behavior; preferred label when user wants iteration) |
| **Commit** | G2-code: commit workflow `files_touched` product paths only (see [Required G2-code save points](#required-g2-code-save-points-both-orch)); never `git add -A` / `git add .` / `{plansDir}/**` |
| **Undo** | Checkpoint revert to `uswf/{workflow-id}/before-step-{N}` for the current step |
| **Pause workflow** | Keeps all artifacts; after pause, switch the model in the session host, then resume |
| Cancel without revert / Cancel and revert | HS-1 / revert per orch policy |

Do **not** offer Switch model / Choose model / concrete model-name menus. Model changes happen only via Pause → session-host model selection → Resume.

**Optional soft tip (standard orch only):** When advancing **into Step 6** (code review), add one hint line under the banner (no picker):

- `Hint: review ahead — consider a Reviewer/Thinking-class model (Pause → switch it in the session host → Resume).`

Log `model-hint | before-step-6 | current={currentModel} | ISO`. Lite: banner only (no phase soft tips).

Routine steps must not bury **Next** under five peers.

---

## Mode selection (entry)

After bootstrap / resume, when starting a **new** workflow (not resume), present once if the user did not pass an explicit density flag:

| Option | Effect |
|--------|--------|
| **Full pipeline** (ws-spec-to-pr default) | Steps 0–9 |
| **Fast (lite-like)** | Prefer `/ws-spec-to-pr-lite` or, inside full orch, complexity gate that skips 1–2–3 when eligible |
| **Auto** | `autoMode` — auto-gate index 0 |

If user invoked `/ws-spec-to-pr-lite`, skip Full vs Fast — already Fast. If `--full` / `auto` / `dry-run` already parsed, do not re-ask density.

---

## Complexity gate (full orch only)

Before Step 1, evaluate complexity (same spirit as Dynamic Execution):

| Class | Criteria | Path |
|-------|----------|------|
| **simple** | Docs-only, single-file text, no cascading side effects | Skip Steps 1–2–3; write stub `step-01-{slug}.plan.md` (goal + files + AC checklist); `execMode: sequential`; jump to Step 4 |
| **standard** | Normal feature | Steps 1 → conditional 2 → 3 → … |
| **complex** | Multi-domain, schema, tenancy, API surface | Enforce 1 + 2 + 3 |

Always write a real plan stub for **simple** (never blank plan reference). Log `complexity | simple|standard|complex | ISO`.

---

## Conditional interview (Step 2, full orch)

Skip Step 2 (mark skipped, log) when **all** hold:

- Complexity ≠ complex
- Plan Open Questions section empty or all marked resolved
- No `blocking` gaps from a 30s orch skim / prior step-output
- `check_memory_conflict.py --json` did not return `force_interview: true`

Otherwise run `ws-interview` (project-context sweep before escalate; in `autoMode`, sweep-miss blocking gaps close as model-inferred — no `user-gate`). A High or Critical MEMORY trap whose `PathPattern` matches a touched plan path forces this interview even when every other skip condition passes. Choosing **End refinement and advance** at 2c **auto-sets** `shared_understanding: confirmed` (skip separate 2e). Only show 2e when 2c was not used to exit.

---

## Check-implementation gate (standard Step 5)

Eval implemented code vs **refined spec when present, else `step-00-{slug}.spec.md`**. Publish integer **score 0–10** in Progress Board + `step-05-{slug}.plan.report.md`.

| Score | Behavior |
|-------|----------|
| ≥ 9 | Complete Step 5; required **G2-code after Step 5 before Step 6** (skip if empty stage); then dispatch Step 6 |
| < 9 | Run **scoreAndRefine** until overall score ≥ 9 (even when `defaults.scoreAndRefine` is false). Write `step-05-{slug}.score-analysis.md`, re-dispatch `ws-implement-tasks` for tasks scoring < 9, re-run `ws-verify-plan`. Max **3** rounds per Step 5 visit; log `score-refine round={n}/3`. After 3 rounds still < 9: **Pause** (fail closed). Resume continues the loop. Refine runs **before** the product commit. Never Advance or auto-approve below 9. |

`autoMode`: auto-run scoreAndRefine rounds; do **not** auto-approve below 9 — Pause only after max rounds still < 9.

---

## Required G2-code save points (both orch)

Orchestrator owns `git commit` via `commit-code` ([`tools.md`](tools.md)). [`ws-code-review`](../ws-code-review/SKILL.md) does **not** commit. `skipQualityGates` does **not** skip these save points or the dirty-tree STOP.

**Staging:** union of workflow `files_touched` (created/updated/deleted) still dirty in `git status`. Drop `{plansDir}/**`, secrets, gitignored, `preExistingDirty`. `git add -- <paths>` and `git add -u --` for those deletes. Never `git add -A`, `git add .`, or directory-wide `src/` `web/` `tests/`. Empty staged set → skip, log `g2-code | skip | empty-stage | ISO`, continue. Before add/commit: `HEAD` must equal `state.branch` (checkout `state.branch` only if drifted; never reset / `-D`).

| Mode | After | Before | Message | `commits[].step` |
|------|-------|--------|---------|------------------|
| standard | Step 5 score ≥ 9 | Step 6 | `feat({slug}): verified implementation` | `5` |
| lite | Step 2 implement (build/tests already in exit criteria) | Step 3 | same | `2` |
| both | Review-fix loop if product files remain (one commit for all ≤3 rounds) | Advance (std 7 / lite 4) | `fix({slug}): code-review fixes` | `6` / `3` |

Optional More-options **Commit** at Step 4 / other boundaries does not replace these points. If Step 4 already committed the full set, post-verify / post-implement is a skip. Step 7 testing G2-code (extra product files after review-fix) stays optional/required as today. Step 8 G2-delivery / G3 unchanged.

**Interactive (stage set non-empty):** (1) **Commit then advance** (Recommended) (2) **Pause**. Do not offer Next-without-commit that dispatches review while product files are dirty. Cancel → HS-1.

**Interactive (empty):** skip G2-code; normal Next.

**`dryRun`:** print message + path list; no `git commit`. Do not dispatch review if the simulated stage set is non-empty and no prior real commit exists.

**Fail-closed review preflight:** If uncommitted workflow product files remain when standard Step 6 / lite Step 3 would start → **STOP**. Offer pending G2-code / Pause. Do not dispatch `ws-code-review`. `{base}` = `config.project.baseBranch` (auto-detect `main` then `master`; never hardcode `master`). Review snapshot is `git diff {base}...HEAD` only.

**Checkpoint:** G2-code after `update_state` for the completed step and **before** tagging `before-step-{next}` so the next checkpoint is the committed snapshot. Append each real commit to `state.commits[]` (`sha`, step, message). Log `g2-code | step={N} | {sha} | {kind} | ISO`.

---

## Combined delivery + ship gate (one user-gate)

Replaces the old separate delivery (Step 12) and ship (Step 13) gates. Presented by the orchestrator at **standard Step 8** / **lite Step 4**:

1. **Commit configured delivery artifacts, then create PR** (Recommended when `fullMode`)
2. **Commit configured delivery artifacts, push only**
3. **Commit configured delivery artifacts, skip PR**
4. **Skip delivery commit and skip shipping**
5. **Pause** (to change model: switch in IDE/agent host, then resume)

When `fullMode` is false, Recommended = **Skip delivery commit and skip shipping** (option 4) unless user explicitly wants push-only. When `fullMode` is true, Recommended = **Commit configured delivery artifacts, then create PR** (option 1).

G2-delivery stages only artifacts enabled by `defaults.deliveryCommitArtifacts` — algorithm and toggle map in [`ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md) § Step 8 (refined-plan fallback preserved when `includeRefinedPlan` is true; delivery result not staged by default).

MEMORY.md / ws-self-learning sweep runs automatically after a successful delivery commit (no separate §Doc gate).

Pass the selected ship intent into `ws-ship-pr` as `shipAction: create-pr|push-only|skip` with `workflowMode: true`, `stopBeforeFixPr: true`.

---

## Fix-PR gate (standard Step 9 / lite Step 5)

Separate from ship. After Step 8 / lite Step 4 when `shipAction: create-pr` and a PR exists:

1. Dispatch `ws-goal-fix-pr` (default loop) or `ws-fix-pr` (one-shot).
2. Merge policy per goal-fix / provider helpers.

Stop: max exhausted · merge blocked · cancelled · PR closed.

---

## Score & Refine gate (`scoreAndRefine`)

Step 5 overall score **must be ≥ 9** to Advance. A score `< 9` **always** runs this loop, even when `defaults.scoreAndRefine` is false.

When the loop is active (score `< 9`, or `scoreAndRefine` mode / completed-workflow bootstrap):

1. **Pass 1 Score Analysis:** Score plan tasks against acceptance criteria (`step-05-{slug}.score-analysis.md`). Flag tasks scoring `< 9`.
2. **Below-9 loop (mandatory):** If overall score `< 9`, do **not** offer Accept First Pass As-Is. Re-dispatch `ws-implement-tasks` for flagged tasks with scoring context, then re-run `ws-verify-plan`. Repeat until overall score `≥ 9`. Max **3** rounds per Step 5 visit; log `score-refine | round={n}/3`. After 3 rounds still `< 9`: **Pause** (fail closed). Resume continues the loop. Never Advance or auto-approve below 9.
3. **Optional polish (overall already ≥ 9 and `scoreAndRefine` flag):** present `user-gate`:
   ```text
   Score Analysis Complete:
   - Overall Score: {score}/10
   - Tasks Flagged for Improvement: {N} tasks

   Options:
   1. Proceed with Second Pass Refinement (Recommended)
   2. Accept First Pass As-Is & Ship
   3. Selective Refinement (choose specific tasks)
   ```
4. **Second Pass Execution:** Re-run implementation for flagged tasks with Pass 1 scoring context, followed by 2nd pass verification and comparative reporting (`step-08-{slug}.second-pass-report.md`).
5. **Comparative Delivery Gate:** When a 2nd pass ran, compare Pass 1 vs Pass 2 scores, LOC deltas, and test metrics before ship/commit.

---

## Safety gates to keep

| Gate | Where |
|------|-------|
| HS-1 / HS-2 / HS-2a | Both orch |
| G2-code | Required: **G2-code after Step 5 before Step 6** (standard) / **G2-code after Step 2 before Step 3** (lite); post-review-fix when product files remain. Optional: Step 4 / Step 7 fix More-options Commit |
| G2-delivery | Inside combined delivery + ship gate above |
| Review findings | Lite Step 3; full Step 6 — fix → re-review until clean (max 3); Pause on residual Critical/Warning |
| Active Resume | `setup.md` |

---

## Auto-gate defaults (shared intent)

| Context | Index 0 |
|---------|---------|
| Transition | Next (Advance) |
| Feature branch (new start) | Stay on current (detached `HEAD`: create `feat/{slug}` from HEAD; never persist `HEAD`; `ls-remote` auth/network → local-check-only) |
| Feature branch resume mismatch | Check out `state.branch` |
| Combined delivery + ship (`fullMode`) | Commit configured delivery artifacts, then create PR |
| Combined delivery + ship (not `fullMode`) | Skip delivery commit and skip shipping |
| Completed workflow bootstrap | Run Score & Second Pass (score-and-refine) |
| Score Analysis gate (`scoreAndRefine`) | Proceed with Second Pass Refinement |
| Check-implementation < 9 | scoreAndRefine until ≥ 9 (max 3); Pause on residual (no auto-approve) |
| Review findings (full Step 6 / lite Step 3) | Autofix → re-review (max 3); Pause on residual Critical/Warning |
| Testing plan (full Step 7) | Approve without browser (or skip if `skipTesting`); mutation runs only when configured and not `skipMutationTesting` |
| Post-verify G2-code (standard after Step 5 / lite after Step 2) | Commit when stage set non-empty; skip when empty |
| Post-review-fix G2-code | Commit when stage set non-empty; skip when empty |

---

## Quality gate bypass (`skipQualityGates`)

Active via `--skip-gates` or `config.json` → `invariants.skipQualityGates`. Orchs and `ws-ship-pr` link here; do not restate the full matrix in skill bodies.

| Skipped (quality only) | Never skipped |
|------------------------|---------------|
| Classifier user-gate | Build / test / leak scans |
| Fable quality visibility (except REFUTED + `auditVerdictsBlockShip`) | SCM resolution and auth |
| Pre-advance CI (`validate_state`) | Safety floor (REFUTED) |
| Telemetry soft gates | HS-1–HS-4 stops; required G2-code save points; review dirty-tree STOP |

**Telemetry:** Append `{"type":"gate-bypass","gate":"{name}","reason":"skip-gates|config","timestamp":"ISO"}` to step JSONL. Pass `--bypassed` to `update_state`. Banner: **`[GATES BYPASSED]`**.

Ship/PREPARE nuances (row 5 visibility): [`../ws-ship-pr/PREPARE-CHECKLIST.md`](../ws-ship-pr/PREPARE-CHECKLIST.md) § 5.

## Flags

| Flag | Meaning |
|------|---------|
| `skipTesting` | Skip Step 7 Testing (auto-skip when no test surface + unit tests green) |
| `skipMutationTesting` | **Config** `defaults.skipMutationTesting` (not workflow state): skip optional mutation substep inside Step 7; default true (opt-in). Also skipped when `verification.mutationTest` empty |
| `scoreAndRefine` | Optional extra polish when Step 5 score is already ≥ 9 (aliases: `analyze-second-pass`, `score-refine`). Score `< 9` always runs this loop until ≥ 9 |

