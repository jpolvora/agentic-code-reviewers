---
name: ws-update-plan-implementation
description: Post-ship QA delta manager — captures manual QA findings, plans delta fixes, executes modifications, and updates delivery summaries.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - update-plan-implementation
  - ws-update-plan-implementation
---

# ws-update-plan-implementation

> When this skill is loaded, output "ws-update-plan-implementation loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Post-workflow delta corrections: capture manual QA findings, plan and implement delta fixes, and update the delivery result summary after the main workflow has finished.

**Canonical paths:** Finalized Plan `step-02-{slug}.plan.refined.md` (fallback `step-01-{slug}.plan.md`); Delivery Result `step-08-{slug}.result.md`. §9 format and examples: [plan-delta-template.md](plan-delta-template.md).

## Invocation

Standalone:

```
/ws-update-plan-implementation <slug-or-plan-path> [session-name=<name>]
```

Not part of the main `ws-spec-to-pr` pipeline; invoked by the developer explicitly after the main workflow completes, when manual QA or browser testing reveals additional gaps.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<slug-or-plan-path>` | required | Feature identifier (e.g. `us-1234`) or relative path to the plan |
| `session-name=<name>` | `post-{timestamp}` | Unique session identifier for the transient log |

## Steps

1. **Bootstrap & context board**: resolve `{slug}` and locate the plan file; query commits since the delivery checkpoint (`git log --oneline {base}..HEAD`); display the Context Board (target slug, active branch, baseline hash, commit list).
   - Done when: the Context Board is shown in English.

2. **Intake gaps**: capture findings from manual QA / browser tests in a structured table (`Finding ID`, `Source`, `Severity`, `Description`, `Expected Behavior`, `Evidence`).
   - Done when: every reported gap has a `F-NN` row.

3. **Delta plan**: append `§9 Post-workflow follow-up` to the finalized plan file per [plan-delta-template.md](plan-delta-template.md): `session-id`, `triggered`, `after-workflow`, `branch`, `Findings`, `Delta implementation steps` (`S-NN`), and a `Certification` checklist.
   - Done when: §9 exists in the plan file with every finding mapped to ≥1 delta step.

4. **Implement & validate**: apply minimal surgical fixes for each open `S-NN`; run validation checks (backend tests, frontend builds); commit in small batches as `fix({slug}): post-workflow {F-NN}`.
   - Done when: every `S-NN` step is implemented and validated.

5. **Verify & certify**: confirm every blocker finding is resolved; record commit hashes in the plan's §9 commits table; update `step-08-{slug}.result.md` (append fixes to the Done section); present the PR Readiness Summary in English.
   - Done when: all blockers show resolved and the result document reflects the delta.

