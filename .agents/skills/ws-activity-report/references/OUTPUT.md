# Output format

Load when emitting `ws-activity-report` results.

## Short title

One line, ~100–120 chars max. Prefer the first useful source:

1. **Work item / issue title** — ADO `System.Title` or GitHub issue title from `step-00-*.issue.json` / `*.issue.json` (`fields["System.Title"]` or `title`).
2. **PR title** — strip noisy prefixes (`feat(US 2670):`, `feat(US-2670):`, `feat(2672) -`, `US 2686 —`) keep the readable remainder.
3. Fallback: `#` / title of `step-00-*.spec.md` or branch name.

If WI/issue and PR differ materially, prefer WI/issue; optional abbreviated `PR: …` note in the technical table. Source label: `WI` | `issue` | `PR` | `spec`.

## Entry form (modal)

```text
### US {id} — {short title}
Date: {YYYY-MM-DD}
Wall Clock: {HH:mm} – {HH:mm} ({wallClockDuration})
Human Total: {humanDuration} (Billable)
Human Breakdown: Reviewing/Deciding {reviewingDuration} | Editing Specs/Plans {editingDuration} | Prompting {promptingDuration}
Agent Running Total: {agentRunningDuration}
Idle / AFK Gap: {idleDuration}
Description:
{line1}
{line2 optional}
```

| Field | Rule |
|-------|------|
| **Date** | Civil day of the segment (report timezone) |
| **Wall Clock** | `HH:mm` start to `HH:mm` end event (`{wallClockDuration}`) |
| **Human Total** | Billable human work duration ({H:MM}); must be ≥ Agent Running Total when agent running > 0 |
| **Human Breakdown** | Breakdown of Human Total (Reviewing/Deciding includes supervision during agent runs) |
| **Agent Running Total** | Duration of agent/subagent execution intervals (tools, turns, automated implementation), capped by the 30-minute idle threshold between events |
| **Idle / AFK Gap** | Non-work inactive gaps ≥ 30 minutes (including long silence between agent events) |
| **Description** | ≤ **2–3 lines**, en-us; `US {id}` + what shipped + human work summary + `PR {n}` |

### Description examples

```text
US 183 — fixed broken ws-shared link paths in THRESHOLDS.md.
Human Total: 0:45 (Reviewing & Deciding: 0:30, Editing Specs: 0:15). Agent Running: 0:20.
PR 42 — closed after review / fix-pr.
```

## Technical table (mandatory)

Every run must include **Short title**, **Human Total**, and **Agent Running Total**:

| US | Short title | Start | End | Human Total | Agent Running Total | Idle Gap | Main Human Activity | Data Sources | End kind | PR |
|----|-------------|-------|-----|-------------|---------------------|----------|---------------------|--------------|----------|----|

Optional audit columns when space allows:

| US | Short title | Title source | First bootstrap file | Start | End | Human Total | Agent Running Total | Idle Gap | Main Human Activity | Data Sources | End kind | PR | Author |
|----|-------------|----------------|----------------------|-------|-----|-------------|---------------------|----------|---------------------|--------------|----------|----|--------|

`End kind` ∈ `thread` | `commit` | `gap`. `Title source` ∈ `WI` | `issue` | `PR` | `spec`.

## Invoice & Payment Summary

```text
### Activity Report — Invoice & Payment Summary
Target Date: {date} ({tz})
Total Billable Human Work Time: {totalHumanTime}
  - Reviewing & Deciding: {totalReviewingTime}
  - Editing Specs & Plans: {totalEditingTime}
  - Prompting & Iterating: {totalPromptingTime}
Total Agent Running Time: {totalAgentRunningTime}
Total Wall Clock Duration: {totalWallClockSpan}

Invoice Line Items:
| Spec / Task ID | Title | Billable Human Hours | Main Activity |
|----------------|-------|----------------------|---------------|
| US {id} | {short title} | {humanDuration} | {mainHumanActivity} |
```

Billable column uses **Human Total** only. Agent Running Total is informational (transparency), not a separate billable line.

## Summary

- Sum of Human Total durations (Billable)
- Sum of Agent Running Total durations
- Wall-clock min→max across entries
- PR ids covered
- Gaps (missing PR, auth, comments, bootstrap files)

## Checklist

1. Resolve `{date}` + timezone
2. Discover overlapping plans
3. Start = `bootstrap_start.py` (creation / override)
4. Short title (WI/issue vs PR)
5. End = max(thread comment, delivery commit)
6. Clip multi-day if needed
7. Description ≤ 2 lines
8. Entries + table with Short title + summary
9. No invented times or titles
