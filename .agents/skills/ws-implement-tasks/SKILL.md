---
name: ws-implement-tasks
description: Task implementation & fix executor — builds planned features following task DAGs or applies surgical defect fixes from code review findings.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - implement-tasks
  - ws-implement-tasks
---

# ws-implement-tasks

> When this skill is loaded, output "ws-implement-tasks loaded."

Execute the coding and testing steps from the plan (build mode) or correct defects from a review or test report (fix mode). Surgical edits only; match stack patterns; no duplication.

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

**Reads:** execution plan (`step-03-*.plan.exec.md`), refined plan (`step-02-*.plan.refined.md`), or draft plan (`step-01-*.plan.md`); `config.json` for layer patterns; consult MEMORY via [`ws-self-learning`](../ws-self-learning/SKILL.md) § Pre-work (expand tokens per [`tools.md`](../ws-shared/tools.md)).

## Invocation

Standalone:

```
/implement-tasks <plan-path> [mode=build|fix] [findings=<path>]
```

Workflow (ws-spec-to-pr Step 4 build; Step 6 / lite Step 3 fix → re-review; Step 7 test failures): orchestrator passes `planPath`, `mode`, and optional `findings` path.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<plan-path>` | required | Execution, refined, or draft plan path |
| `mode` | `build` | `build` or `fix` |
| `findings` | (optional) | Findings report or review comments path |

## Build mode

1. **Load plan** — Parse execution tasks or plan steps; identify files to create/modify and their acceptance criteria.
   - Done when: every task/step has an identified file list and AC.

2. **Consult MEMORY** — Via [`ws-self-learning`](../ws-self-learning/SKILL.md) Pre-work for 3–8 modules/paths/keywords in the plan; apply Medium+ Solutions before editing; record search keywords and hits.
   - Done when: relevant entries noted or none found; keywords recorded for `step-output.memory_consult`.

3. **Detect layers & consult pattern files** — Identify target layers from plan files and stack:
   - If Web/UI files are touched and `defaults.patternsFrontend` is `true`: **Read** `{sharedDir}/frontend.md` (or fallback to `{sharedDir}/frontend.md.template` if missing) and load [`ws-patterns-frontend`](../ws-patterns-frontend/SKILL.md) before modifying UI components, templates, or styling.
   - If Domain/Application/EF/backend files are touched and `defaults.patternsBackend` is `true`: **Read** `{sharedDir}/backend.md` (or fallback to `{sharedDir}/backend.md.template` if missing) and load [`ws-patterns-backend`](../ws-patterns-backend/SKILL.md) before modifying backend logic.
   - Done when: matching pattern files are read and recorded in `step-output.pattern_consult` (`consulted` | `skipped` | `n/a`).

4. **Scan codebase** — Locate similar patterns in the project layers (`config.json`) for style consistency.
   - Done when: a matching pattern is found, or none exists and this is noted.

5. **Implement** — Write minimal, modular code matching the requirements without scope creep.
   - Done when: every planned file is created or modified per its AC.

6. **Fix the Entire Defect Class** — After Implement (build mode), repo-wide search/grep for the same defect pattern or vulnerability class (not style-only). Fix same-class siblings in scope; list remaining hits or exemptions (path + reason) in `step-output.summary`. Fix mode step 4 widens sibling sweep from modified directories to **repo-wide same pattern** with the same exemption rule.
   - Done when: search performed; remaining hits listed or justified.

7. **Validate** — Run build and unit tests for modified layers from `config.json.verification`.
   - Done when: applicable verification commands exit 0 (or failures are listed in step-output with `status: failed`).

8. **Report** — Return the modified/created file lists and test output details.
   - Done when: the step-output below is populated.

## Fix mode

1. **Intake gaps** — Load findings from `step-06-*.review.md` / `step-06-*.fix.report.md`, `step-07-*.testing.report.md`, or review comment threads.
   - Done when: every finding is enumerated.

2. **Consult MEMORY & pattern files** — Via [`ws-self-learning`](../ws-self-learning/SKILL.md) Pre-work for the defect class / paths; if matching layers are affected and `defaults.patternsFrontend` / `defaults.patternsBackend` are `true`, consult `{sharedDir}/frontend.md` / `{sharedDir}/backend.md` (or fallback to templates if missing); reuse known Solutions before inventing fixes.
   - Done when: relevant entries noted or none found.



3. **Correct** — Apply minimal, targeted fixes per [ws-karpathy-guidelines](../ws-karpathy-guidelines/SKILL.md).
   - Done when: every enumerated finding has a corresponding edit.

4. **Sweep siblings (repo-wide defect class)** — Search **beyond modified directories** (repo-wide grep of the same defect/pattern) for the same vulnerability/pattern; fix simultaneously or name exemptions (path + reason).
   - Done when: no same-class sibling occurrence remains unfixed without a named exemption.

5. **Anti-regression test** — Write a unit test covering the corrected defect scenario.
   - Done when: each fixed finding has a covering test.

6. **Validate** — Run project build and test suites from `config.json.verification`.
   - Done when: applicable verification commands exit 0 (or failures are listed in step-output with `status: failed`).

## Output (both modes)

Modify the working tree directly; never commit or push.

### step-output (workflow mode)

```yaml
status: success | partial | failed | needs_user
pattern_consult:
  frontend: consulted | skipped | n/a
  backend: consulted | skipped | n/a
memory_consult:
  keywords: []
  hits: []
files_touched:
  created: []
  modified: []
  deleted: []
verification:
  files_on_disk: pass | fail
  build: pass | fail | skipped
  tests: pass | fail | skipped
summary: |
  (Summary text of changes and verifications)
```


## Rules

No commit/push (orch/user owns staging). Surgical scope only. Schema migrations via project CLI only.

## Subagent contract

- Implement only assigned task ids, AC ids, and writable paths.
- Consult injected memory and matching backend/frontend patterns before mutation.
- Run the named configured verification commands after each task batch.
- Never write workflow state or ledger files; return structured evidence to the orchestrator.
- Report exact touched files, pattern consult, memory consult, checks, and remaining gaps.
