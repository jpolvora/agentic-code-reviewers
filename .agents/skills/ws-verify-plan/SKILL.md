---
name: ws-verify-plan
description: Spec compliance scorer (0–10). Pipeline advances only at score ≥ 9; below 9 runs scoreAndRefine. Trigger for check-implementation or orch Step 5.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - verify-plan
  - ws-verify-plan
---

# ws-verify-plan

> When this skill is loaded, output "ws-verify-plan loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Audit implementation deliverables against the specification and plan. 

Runs in two modes: **Quick Score** (code quality vs plan, no spec required) or **US Verification** (feature-by-feature match between spec, plan, and code).

**Canonical output:** `{us-dir}/step-05-{slug}.plan.report.md`. Optional Quick Score report shape: [`TEMPLATE.md`](TEMPLATE.md).

## Invocation

Standalone:

```
/verify-plan [spec-input] [plan-dir=<path>]
```

Workflow (ws-spec-to-pr Step 5): orchestrator passes `specPath`, `planDir`, optional `mode=quick|full`. Default `mode=quick`; escalate to `full` when quick score < 9, orchestrator passes `mode=full`, or user passed `--strict`.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `spec-input` | (optional) | Path to `step-00-*.spec.md`, US number, or omit for Quick Score |
| `plan-dir` | `{us-dir}` | Optional override for `{us-dir}` (`{plansDir}/{slug}/`) |
| `mode` | `quick` (workflow) / `full` (standalone with spec) | Verification depth |

## Steps

1. **Resolve source**: search `{us-dir}` in order for `step-02-{slug}.plan.refined.md` (refined, primary), then `step-01-{slug}.plan.md` (fallback). In full mode, also resolve the primary evaluation source: the refined plan when present, else `step-00-{slug}.spec.md`.
   - Done when: the resolved plan (and, in full mode, spec) path is known.

2. **Evaluate**: Quick Score scores Completeness (40%), Correctness & Style (35%), Tests (25%), each 0-10. US Verification maps every plan feature and acceptance criterion to **Implemented**, **Not implemented**, or **Implemented differently**, each with file:line evidence.
   - Optional `fable` integration: If `config.json.fable.enabled` and `autoAudit` are `true`, run [`ws-fable-judge`](../ws-fable-judge/SKILL.md) against `git diff` ground truth. Record verdict (`VERIFIED`, `VERIFIED WITH CAVEATS`, `REFUTED`) and fraud findings in the report.
   - Done when: every planned feature/AC has a situation and evidence, and Quick Score's three metrics are each scored.

3. **Score**: link semantic/file/test/alias/sabotage evidence to `{us-dir}/ac-ledger.json`, then run `node {skillsRoot}/ws-spec-to-pr/scripts/ac_ledger.cjs score --ledger <path> --boundary step5`. This derived integer **0-10** is the only score; never author or override a numeric score in a report or state update.
   - **Regression Sabotage Check:** For bug-fix/regression tests, run `python {skillsRoot}/ws-testing/scripts/run_sabotage.py` with caller-authored invert patch. Record pass/fail/skipped+reason in the report. Missing **required** sabotage → fail-closed overall score **< 9** (never Advance; triggers `scoreAndRefine` / Pause per `gates.md`). Restore failure aborts this step (exit 1).
   - Optional `fable` integration: use the normalized tri-state policy from the shared workflow runtime. `REFUTED` always blocks as the safety floor; `"refuted"` blocks `REFUTED`; `"caveats"` also blocks `VERIFIED WITH CAVEATS`; `false` never relaxes the `REFUTED` floor. Link the verdict and finding evidence before scoring.
   - Done when: an integer score 0-10 is set.

4. **Write report**: save `{us-dir}/step-05-{slug}.plan.report.md` using [`TEMPLATE.md`](TEMPLATE.md) shape (frontmatter: `us`, `reportDate`, `score`, `sourcePlans`, `evalSource`; body sections Result by Feature, Additional Features, Gaps and Next Steps). Do not edit the reference plan/spec files.
   - Done when: the report file exists with `Score: N/10` near the top and every required section populated.

5. **Handoff**: return the score and report path.
   - Workflow: the orchestrator owns the gate after reading the report: score `>= 9` advances to Step 6; score `< 9` runs `scoreAndRefine` (re-implement flagged tasks + re-verify) until `>= 9` (max 3 rounds per visit, then Pause). Do not auto-approve below 9.
   - Standalone: apply the same `>= 9` / `< 9` threshold; recommend `scoreAndRefine` until `>= 9` when below 9.
   - Done when: the caller has the score and report path.

## Subagent contract

- Inspect the immutable product snapshot and supplied AC ledger without changing product files.
- Link only observed semantic, file-line, test, alias, sabotage, and verdict evidence.
- Derive the score through `ac_ledger.cjs`; never author or override it.
- Write only the assigned verification report and return score plus findings.

