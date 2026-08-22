---
name: ws-code-review
description: Local two-phase code review with fix → re-review loops (max 3). Trigger when reviewing a branch/diff before ship, or when orch Step 6 / lite Step 3 runs.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - code-review
  - ws-code-review
---

# ws-code-review

> When this skill is loaded, output "ws-code-review loaded."

Review modified files vs the base branch for correctness, security, policy, and diff quality. Clear Critical/Warning via fix → re-review before Advance. For external CI-shaped dry-run preview (no PR threads), use [`ws-preview`](../ws-preview/SKILL.md) instead.

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

**Canonical output:** `{us-dir}/step-06-{slug}.review.md`. Optional fix summary: `{us-dir}/step-06-{slug}.fix.report.md`.

## Invocation

Standalone:

```
/code-review [base=<ref>] [plan=<plan-path>]
```

Workflow (ws-spec-to-pr Step 6 / lite Step 3): dispatched automatically, receives `base` and `planPath` from orchestrator state.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `base` | `config.project.baseBranch`, then auto-detect `main`/`master` (prefer `origin/{name}` when that remote-tracking ref exists) | Git ref to diff against. Never hardcode `master`. |
| `plan` | (optional) | `step-02-*.plan.refined.md` or `step-01-*.plan.md` to cross-reference planned changes |

**Committed snapshot:** Primary diff is `git diff --name-status {base}...HEAD`. Do not treat the dirty working tree as the review snapshot. Workflow: orchestrator **STOP**s if uncommitted workflow product files remain — do not dispatch this skill. Standalone `/code-review`: warn if dirty product files exist; still review `{base}...HEAD` only. This skill does **not** run `git commit` (orchestrator owns G2-code).

## Fix → re-review loop (workflow)

Fix is not its own workflow step. **Do not advance with open Critical/Warning** — clear them in this step so defects do not accumulate downstream.

| Case | Behavior |
|------|----------|
| Clean (no Critical/Warning) | Complete Step 6 / lite Step 3; Advance |
| Critical or Warning findings | Run **fix → re-review** rounds until clean or max rounds |
| Suggestions only | Optional one fix pass; do not block Advance |
| Residual Critical/Warning after max rounds | **Pause** (fail closed) — do not Advance |

**Round loop (max 3):**

1. Dispatch [ws-implement-tasks](../ws-implement-tasks/SKILL.md) `mode=fix` against current findings (include Suggestions in the same surgical pass when fixing).
2. Targeted re-review of touched scope (Steps 1–6 below, focused on prior findings + new regressions).
3. Write the immutable round through `node {skillsRoot}/ws-code-review/scripts/write_review_round.cjs --input <draft> --output-dir "{us-dir}" --slug "{slug}" --round {n}`. The helper retains `step-06-{slug}.review.r{n}.md` and updates canonical `step-06-{slug}.review.md`.
4. **State / memory each round:** log `review-fix | round={n}/3 | fixed=… | remaining=…` in gate history; append traps/gaps to `## Workflow memory` in state; when a durable anti-regression trap appears, write via [ws-self-learning](../ws-self-learning/SKILL.md) (or `Learning: N/A` if none).
5. Exit when no Critical/Warning remain, else continue until round 3.

**Modes:**

| Mode | Gate / auto |
|------|-------------|
| Interactive | Gate after first report: **Apply fixes and re-review** (Recommended) / **Pause**. Do not offer “Proceed without fixing” while Critical/Warning remain. |
| `autoMode` | Autofix without asking; same max **3** rounds; residual Critical/Warning → Pause |

Log `review-fix` in gate history; do not add a separate `completedSteps` entry for the fix substep. Standalone `/code-review`: same loop after user confirms Apply fixes (Step 8).

## Steps

1. **Detect stack & diff**: read `config.json.stack` to scope backend/frontend layers; exclude `bin/`, `obj/`, `dist/`, `node_modules/`, CI YAML, translations. Resolve `{base}` from `config.project.baseBranch` (auto-detect `main` then `master`). Run `git diff --name-status {base}...HEAD` over in-scope paths — that committed range is the **only** primary file list.
   - Done when: the in-scope modified file list is known.

2. **Triage**: flag lines with defect hypotheses; discard cosmetic nits, untouched pre-existing code, and low-risk UI without security surface.
   - Done when: a hypothesis list of candidate findings exists.

3. **Investigate**: for each hypothesis, complete all four proof steps: Evidence Read, Failure Scenario, Missing Protection, Discards. Drop any hypothesis that cannot complete all four.
   - Done when: every retained finding has all four proof steps documented.

4. **Generalize defect class**: for each proven finding, search the full diff **and sibling modules beyond the diff** for the same vulnerability/pattern; report as a class finding or named exemption (path + reason). Critical if an unfixed sibling of a proven defect remains without exemption.
   - Done when: sibling occurrences beyond the diff are searched and reported (or none found).

5. **Sweep known patterns & MEMORY**:
   - Read compiled `{sharedDir}/MEMORY.md` entries (titles, Module/Layer tags, and `DO NOT` / `INSTEAD DO` directives) against the in-scope modified file list and plan keywords; report confirmed violations as Warning or Critical by severity.
   - If Web/UI files are in the diff and `config.json.defaults.patternsFrontend` is `true`: **Read** `{sharedDir}/frontend.md` (or fallback to `{sharedDir}/frontend.md.template` if missing) and check for project UI/UX pattern violations (e.g. missing Back button toolbar on subpages, hardcoded copy vs i18n, subscription cleanup, grid/table styling conventions).
   - If Domain/Application/EF/backend files are in the diff and `config.json.defaults.patternsBackend` is `true`: **Read** `{sharedDir}/backend.md` (or fallback to `{sharedDir}/backend.md.template` if missing) and check for domain/architectural pattern violations.
   - Done when: memory entries and relevant pattern files have been swept against the diff, and any confirmed violations are listed.



6. **Check invariants**: cross-check `config.json.invariants` / `config.json.rules`: tenancy filters, DB-migrations-CLI-only, domain rules, React hook cleanup/dependency arrays, and i18n keys present in every locale from `config.json.stack.frontend.i18n.locales[]`.
   - Optional `fable` integration: If `config.json.fable.enabled` and `autoAudit` are `true`, run [`ws-fable-judge`](../ws-fable-judge/SKILL.md) for Weakened Checks, False Completion, Scope Creep, Unauthorized Action. Report detected frauds as Critical or Warning.
   - Done when: each applicable checklist item is checked.

7. **Write report**: draft the report, then persist it with `write_review_round.cjs` (stamps step-artifact metadata: `step`, `slug`, `workflowId`, `status`, `startedAt`, `endedAt`, `acRefs`). No findings: write `No feedback` and stop (clean). Every finding heading is `### CR-NNN [Critical|Warning|Suggestion] open|closed path:Lstart-Lend`; retain the same stable id in later rounds and close it only after an earlier round opened it. An ineffective assertion, test, gate, or check is minimum Warning. Include description, score `/10`, sibling occurrences, and a `suggestion` block; end with **Apply fixes?** (workflow: answer follows the loop table above).
   - Done when: the report file matches the format described above.

8. **Apply fixes + re-review**: under workflow (and standalone after YES), run the fix → re-review loop (max 3). Each round: surgical fixes via `ws-implement-tasks` `mode=fix`, run `config.json.verification` build/test aliases for touched layers, re-review, update `step-06-{slug}.fix.report.md`, record state/memory. Stop when clean or after round 3 with Pause on residual Critical/Warning.
   - Done when: no Critical/Warning remain, or Pause after max rounds with residual findings documented.

## Rules of engagement

- Include only findings with complete Investigate proof (all four steps); no speculative comments.
- Clear Critical/Warning before Advance via fix → re-review (max 3).
- Do not commit: changes stay in the working tree for the orchestrator or developer to stage. Do not treat uncommitted files as the review snapshot.

## Subagent contract

- Review only the pinned committed diff and read-only sibling evidence.
- Give each proven finding a stable id, severity, evidence range, and state.
- Treat ineffective assertions, tests, gates, and checks as minimum Warning.
- Write only the assigned review draft; the orchestrator persists rounds and ledger links.
- Return findings sorted by severity, path, line, and id.
