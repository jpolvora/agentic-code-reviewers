---
name: ws-testing
description: Pre-PR test suite executor — plans and executes unit, integration, E2E, coverage, and optional mutation-testing batteries with quality verification.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - testing
  - ws-testing
---

# ws-testing

> When this skill is loaded, output "ws-testing loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Plan and execute the pre-PR **testing** battery: unit tests, integration/E2E flows, coverage signals, testing quality (assertions, fixtures, flakiness), feature quality against acceptance criteria, and an optional **mutation testing** substep (kill/survive score vs threshold).

**Canonical outputs:** `step-07-{slug}.testing.plan.md`, `step-07-{slug}.testing.report.md`. Do not write retired artifact names (`step-11-*.integration-test.*`).

## Invocation

Standalone:

```
/testing <plan-path> [spec=<spec-path>] [skip-browser]
```

Workflow (ws-spec-to-pr Step 7): dispatched with `planPath` and `specPath` from orchestrator state. The orchestrator, not this skill, decides skip when `skipTesting` is set or when there is no meaningful test surface and unit tests are already green. UI browser testing requires explicit authorization. Mutation is **standard Step 7 only** — lite orch does not dispatch this skill. On Step 7 `autoMode` dispatch, the orchestrator supplies the resolved test-executor model (`defaults.testingModel` when non-empty, else `executionModel`, else the active session model). This skill does not pick a different model on its own. Standalone `/testing` (no orch) uses the current session model and does not switch.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<plan-path>` | required | `step-02-*.plan.refined.md` or `step-01-*.plan.md` |
| `spec=<spec-path>` | inferred from folder | `step-00-*.spec.md` |
| `skip-browser` | `false` | Skip browser-agent/UI testing; backend/API only |

## Prerequisites

- `config.json` resolves local dev server URLs (`apiHost`, `devHost`), locales, and DB seed keys.
- `config.json.verification` build aliases exit 0 before Step 3; DB migrations applied when required.

## Mutation config

| Key | Role |
|-----|------|
| `verification.mutationTest` | Shell command for the consumer's runner (Stryker, PIT, mutmut, …). Empty/unset → mutation **skipped**. |
| `verification.mutationThreshold` | Minimum score percent `killed/(killed+survived)*100` (default **80** when mutation runs and key omitted). |
| `defaults.skipMutationTesting` | Default **true** (opt-in). When true → mutation **skipped** even if `mutationTest` is set. |

**Skip mutation (log `status: skipped`, do not fail)** when any of: orch/`defaults.skipTesting`; Step 7 auto-skip (no test surface + unit green); `defaults.skipMutationTesting` true; or `verification.mutationTest` empty/unset.

**Score parse:** Prefer runner-reported percent. Else compute from killed/survived counts in stdout/JSON when present. Record both counts in the report when available.

## Steps

1. **Plan**: write `step-07-{slug}.testing.plan.md` covering unit & coverage commands (from `config.json.verification`) and gaps vs changed files; target hosts/ports and credentials; DB seed datasets and rollback per AC; API contracts (status codes, Bearer JWT, error shapes); RBAC and tenancy isolation checks; integration/E2E paths (cross-service, UI routes, translations); a feature-quality AC checklist mapped to observable outcomes (not just happy-path 200s); defect-threshold pass/fail metrics; and when mutation is enabled for the run, a **Mutation** section (command, threshold, scope: changed files / project default).
   - Done when: the plan file exists covering all areas above (Mutation section present when enabled).

2. **Verify base build**: run build and core test commands from `config.json.verification`.
   - Done when: applicable verification commands exit 0 (failures listed in report with `status: failed`).

3. **Run unit tests**: execute project unit test suites; note failures and missing coverage on touched code.
   - Done when: unit suite exit code recorded (0 or fail with log excerpt).

4. **Apply DB seeds**: apply and verify seed constraints and cleanups.
   - Done when: seed state is verified or reported as unnecessary.

5. **Run API/integration checks**: probe endpoints via `curl` or script runners.
   - Done when: every planned API contract check ran.

6. **Run UI/E2E validation**: run browser automation or visual checks unless `skip-browser` is set.
   - Done when: UI/E2E checks ran or were explicitly skipped.

7. **Mutation testing** (optional): only after Steps 2–3 (and other planned suite checks that apply) succeed. If skip rules apply → record Mutation `skipped` + reason and continue to Report. Else run `verification.mutationTest` with an explicit launcher per [`tools.md`](../ws-shared/tools.md) § Script launchers; compare score to threshold.
   - **Pass:** score ≥ threshold → Mutation `status: passed` (include score; killed/survived when known).
   - **Fail:** score &lt; threshold or non-zero exit → Mutation `status: failed`; **do not** treat Step 7 as complete for Advance — orch/`user-gate` offers handoff to [`ws-implement-tasks`](../ws-implement-tasks/SKILL.md) fix mode to strengthen tests (kill survivors). This skill does not edit product or test code.
   - Done when: Mutation recorded as `passed` | `failed` | `skipped`.

8. **Regression sabotage** (when mutation skipped/unset): after unit tests, run `python {skillsRoot}/ws-testing/scripts/run_sabotage.py` on newly added regression assertions (caller-authored invert patch) using a non-empty configured verification alias. Expect test **non-zero** with inverted code; every declared path must change bytes and restoration must match the pre-invert snapshot bytes on `--paths` only (other dirty tracked files do not fail restore). Restore failure → abort Step 7. Link the helper exit code to the AC ledger; the ledger derives pass/fail and the score cap. When full mutation ran, log sabotage `skipped` (superseded).
   - Done when: sabotage recorded as `passed` | `failed` | `skipped` + reason.

9. **Report**: write `step-07-{slug}.testing.report.md` with results from Steps 2–8, including an accessibility/contrast check on form validation errors and alert indicators. Always include **Mutation** and **Regression Sabotage** sections. Final pass verdict only when neither is `failed` and other planned areas passed (or were skipped per policy).

## Rules of engagement

- No code fixes: report gaps (including surviving mutants) and hand off to [ws-implement-tasks (fix mode)](../ws-implement-tasks/SKILL.md) rather than editing code.
- Do not vendor a mutation engine — consumers own `verification.mutationTest`.

## Subagent contract

- Execute only configured test commands and authorized integration surfaces.
- Capture test names, source files, aliases, timestamps, and exit codes for ledger linkage.
- Derive sabotage status from the helper exit code and preserve byte-identical restoration.
- Write only testing plan/report artifacts; hand product fixes back to implementation.
- Return observed tests or machine skip evidence.
