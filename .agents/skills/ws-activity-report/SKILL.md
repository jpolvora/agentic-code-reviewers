---
name: ws-activity-report
version: 0.3.30
description: >-
  Timesheet entries (date, start, end, description) for ws-spec-to-pr /
  ws-spec-to-pr-lite deliveries. Start = earliest bootstrap file creation in
  the plan folder; end = latest of last PR thread comment or last delivery
  commit. Trigger on activity-report {date}, log hours, timesheet, or
  activities for a day.
invocation_names:
  - activity-report
  - ws-activity-report
---

# ws-activity-report

> When this skill is loaded, output "ws-activity-report loaded."

Read-only timesheet builder for a civil day. Emits **entries** + **technical table** + **summary**. Does not commit, push, or post PR comments.

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

## Invocation

```text
/ws-activity-report 2026-08-05
/ws-activity-report 2026-08-05 --tz America/Manaus
activity-report yesterday
log hours for 2026-08-05
timesheet US 183, 150
```

| Arg | Rule |
|-----|------|
| `{date}` | Civil day `YYYY-MM-DD` or `DD/MM/YYYY`. If omitted → **yesterday** in report timezone. |
| `--tz` | IANA zone or fixed offset (`UTC-4`). Default: **UTC**. |
| US ids | Optional filter (`US 183`, `183`). Else discover plans that **overlap** the target day. |

Output language: **en-us**. Clock rules: [`references/TIMING.md`](references/TIMING.md). Form fields: [`references/OUTPUT.md`](references/OUTPUT.md).

## Steps

1. **Resolve day** — Parse `{date}` + `--tz`. Expand `{plansDir}` / `{sharedDir}` / `{skillsRoot}` from config + [`../ws-shared/tools.md`](../ws-shared/tools.md).
   - Done when: target civil day and timezone are fixed.

2. **Discover plans** — Glob `{plansDir}/**/*.state.md` (include archives). Keep folders with state or `step-00-*`. Include if interval crosses target day, or if user listed ids.
   - Done when: candidate `{us-dir}` list is known (may be empty → report and stop).

3. **Start clock** — Per `{us-dir}`, run:
   ```bash
   python {skillsRoot}/ws-activity-report/scripts/bootstrap_start.py {us-dir}
   ```
   Start = script `startIso`. Cross-check `startedAt` in state YAML for audit only (script applies bulk-sync override when needed). Do **not** use PR merge or mtime of steps 01+.
   - Done when: each candidate has `startIso` or a documented gap.

4. **End clock** — Resolve PR from state (`prNumber` / `prId` / `prUrl`) or provider. Load threads via active SCM provider `list-threads` ([`ws-github-provider`](../ws-github-provider/SKILL.md) / [`ws-azure-devops-provider`](../ws-azure-devops-provider/SKILL.md)). Compute `endIso` = **max** of:
   - latest non-deleted thread comment time (`publishedDate` / equivalent; fallback content-updated)
   - latest delivery commit time (PR head / state `commits[]` / `git log` on working branch)
   Prefer TIMING § End. Without auth → local commit/artifacts only + **Gaps**.
   - Done when: each candidate has `endIso` + end-event kind (`thread` | `commit` | `gap`).

5. **Infer human work timing** — Per `{us-dir}`, run:
   ```bash
   python {skillsRoot}/ws-activity-report/scripts/infer_human_timing.py {us-dir} --start-iso {startIso} --end-iso {endIso}
   ```
   Extracts Human Total (billable), Agent Running Total (active agent intervals below the 30m idle threshold), idle gaps (≥30m, including silence between agent events), and human activity breakdown (Reviewing/Deciding vs Editing Specs/Plans vs Prompting) from commits, state, PR threads, and transcript telemetry. Human Total must be ≥ Agent Running Total when agent running > 0 (TIMING § Invariant).
   - Done when: Human Total, Agent Running Total, and category breakdown are resolved per candidate.

6. **Short title** — One line ≤ ~120 chars: WI/issue title → cleaned PR title → spec `#` / branch (OUTPUT § Short title).
   - Done when: title + source (`WI` | `issue` | `PR` | `spec`) set per US.

7. **Clip & emit** — Multi-day intervals → one entry per civil day (00:00 / 23:59 cuts) or clip to target day only. Emit OUTPUT § Entries (with **Human Total** & breakdown) + mandatory technical table (incl. **Human Total**, **Agent Running Total**, **Main Activity**) + **Invoice & Payment Summary**. Invent nothing.
   - Done when: entries + table + invoice summary printed; skill stops.

## Rules

- Path tokens only — never hardcode `{plansDir}` or consumer org/repo names.
- Reuse provider `list-threads`; do not duplicate SCM auth recipes here.
- Entry description ≤ **2–3 lines**; short title ≤ ~120 chars.
- Positive enclosure: report measured clocks and gaps — never fabricate times or titles.
