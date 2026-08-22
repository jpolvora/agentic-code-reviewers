# Plan Implementation Audit Report

Template for **Quick Score Mode** of `ws-verify-plan`.
Used when there is no `spec.md` and no US number, or when the orchestrator passes `mode=quick`.

Canonical skill: [`SKILL.md`](SKILL.md).

- **Target Plan**: [Plan Name/Path]
- **Date/Time**: [Timestamp]
- **Derived ledger score**: [0-10]/10

## Executive Summary
[Brief description of what was implemented and overall assessment]

## Evaluation Criteria

| Criterion | Score (0-10) | Notes |
| :--- | :--- | :--- |
| **Completeness** (40%) | | [Did it do everything in the plan?] |
| **Correctness & Style** (35%) | | [Any bugs, styling issues, tenancy issues?] |
| **Testing** (25%) | | [Were tests written, ran, and did they pass?] |

## Regression Sabotage Check

| Status | pass / fail / skipped |
| Reason | (when skipped: no new regression test, invert not possible, or mutation superseded) |
| Evidence | invert patch path, test command exit code, restore clean |

## Recommendation
- [ ] **SCORE AND REFINE**: Score < 9. Re-implement flagged tasks and re-verify until >= 9.
- [ ] **APPROVE & COMMIT**: Score >= 9. Proceed to code review and commit.

### Details / Feedback
[Specific files to fix or rewrite, if any]

The orchestrator owns any later path-scoped commit. This verifier never stages or commits files.
