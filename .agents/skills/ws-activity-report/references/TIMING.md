# Timing rules (SoT)

Load only when computing start/end for `ws-activity-report`.

## Start — earliest bootstrap creation (step 0)

Folder: `{us-dir}` = `{plansDir}/{slug}/`.

### Candidate files (preference order for *discovery*, not timestamp)

1. `.runtime/started-at.txt`, `.runtime/workflow-id.txt`, `.runtime/baseline.txt`
2. `*.state.md` (non-archive preferred; include archive if that is all that remains)
3. `step-00-*.issue.json`, `step-00-*.spec.md`, `step-00-*.classify.md`, `*-*.issue.json` at `{us-dir}` root

### Creation time (not sync mtime)

| Platform | Field |
|----------|--------|
| Windows | `st_ctime` (creation) |
| Unix with birth | `st_birthtime` when present, else `st_ctime` |

**Start** = earliest creation among candidates found.

### Bulk-sync override

If many candidates share the same artificial ctime second **and** state frontmatter `startedAt` is materially earlier, prefer `startedAt` (treating file ctimes as a later sync). Script `bootstrap_start.py` applies this when `--json` shows `override: startedAt`.

`.runtime/started-at.txt` / YAML `startedAt` always appear in the technical audit; the **billing clock** follows the rule above (file creation, unless override fires).

**Never** use PR merge time or mtime of steps 01–09 as start.

## End — latest delivery-cycle event

Resolve PR: state `prNumber` / `prId` / `prUrl` → provider relations / branch from state `branch` / `workingBranch`.

### Candidates

1. **Thread comments** — all non-deleted comments on all PR threads (system, review, resolution-reply, status). Time = `publishedDate` (ADO) or comment `createdAt` / updated (GitHub). Fallback: content-updated field when publish missing.
2. **Delivery commits** — latest of:
   - `git log -1 --format=%cI` on PR head / state `branch` (when resolvable)
   - committer dates for shas in state `commits[]`
   - if no PR: same on state branch / recent delivery commits tagged in state

**End** = **maximum** timestamp among (1) and (2). Report winning kind in the technical table (`thread` | `commit`).

### Fallbacks (always flag Gaps)

| Situation | End fallback |
|-----------|--------------|
| PR exists, no comments, no commits found | PR `creationDate` / `createdAt` + gap |
| No PR | Latest step-08 / local delivery artifact creation + gap; or state `endedAt` if present + gap |
| No remote auth | Local commit / artifact path only + gap |

**Do not** use PR `closedDate` / merge completion as the primary end when thread comments or commits exist (may coincide; source of truth is the max event above).

Audit fields for a winning thread comment: `threadId`, author, snippet, comment type, thread status.

## Multi-day clip

If start and end fall on different civil days in the report timezone:

- Target day only → clip segment to that day (`00:00` continuation / `23:59` mid-span / real ends on last day).
- Full range requested → one entry per civil day with the same cuts.
- Always show the full unclipped interval in the technical table.

## Overlap

Always emit **real** clocks (start → end). Warn when entries overlap on the target day. Repack without overlap **only** if the user asks.

## Inferred Human Work Duration & Billing Telemetry

Run `python {skillsRoot}/ws-activity-report/scripts/infer_human_timing.py {us-dir}` to compute billable human work time, agent running time, idle gaps, and activity category breakdowns.

### Invariant (billable)

When `agentRunningSeconds > 0`, **Human Total** (`humanSeconds`) must be **≥ Agent Running Total** (`agentRunningSeconds`). Agent-running intervals are concurrent human supervision/review and count toward Human Total — not exclusive idle wait that reduces billable hours below agent run duration.

### Human Work Categories

1. **Reviewing / Deciding / Gating**: Time spent reading plans, specs, diffs, answering `user-gate` prompts, reviewing PR threads, and approving step transitions.
2. **Editing Specs / Plans / Code**: Time spent by human writing/editing `.spec.md`, `.plan.md`, `AGENTS.md`, or manual code edits (human git commits and file modifications).
3. **Prompting & Directing**: Active human prompt authoring and task direction time.

### Telemetry & Inactivity Thresholds

- **Agent Running Total**: Active intervals where the agent/LLM (or subagents) ran tools, implemented tasks, or generated automated outputs, **up to the 30-minute idle threshold**. Any inter-event silence ≥ 30 minutes is Idle/AFK (not Agent Running), even when bracketed by `agent_tool` events. Reported separately for transparency; included in Human Total as supervision/review when counted as active.
- **Idle / AFK Gaps**: Non-work gaps ≥ 30 minutes of zero human/agent interaction (e.g., overnight, away from desk, or long silent stretches between telemetry events). Excluded from Human Total and Agent Running Total.
- **Data Sources Evaluated**: Local git commit logs, workflow state files (`*.state.md`, `exec.dag.json`), SCM PR threads/comments, and local session transcript telemetry (`transcript.jsonl`).

