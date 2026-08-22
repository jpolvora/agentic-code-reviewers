# ship-pr — ws-goal-fix-pr timing overrides

Load with [SKILL.md](SKILL.md) Step 6 (monitor reviews & converge). Parent loop: [ws-goal-fix-pr](../ws-goal-fix-pr/SKILL.md). Prepare-to-PR gate (before push): [PREPARE-CHECKLIST.md](PREPARE-CHECKLIST.md).

## Why wait for code-review (30s initial delay + 300s default)

Agentic Code Review, CI, and human reviewers comment **after** the first push and PR creation. After pushing and creating PR, `ship-pr` **waits 30 seconds** for the code-review action to start on GitHub infrastructure, then starts `ws-goal-fix-pr` (default **300s** heartbeats) until there are **no open issues to fix**, and only then merges (Step 7).

## Overrides

| ws-goal-fix-pr default | ship-pr |
|---------------------|---------|
| Start immediately post-PR | **30s initial delay** post-PR creation (wait code-review action to start on GitHub infrastructure) |
| `sleep 120` post-push heartbeat | **`sleep 300`** default (300s post-push heartbeat & monitor loop) |
| Sentinel `AGENT_GOAL_WAKE_fixpr_<N>` | **`AGENT_SHIP_PR_WAKE_<N>`** |
| `max` default 20 | Parse token (default **10**) |

Everything else unchanged: branch sync, fix-pr steps 0–7, auto gates, commit message `fix(#<PR>): auto-fix issues from review threads [...]`, verify build/tests, Escalate stops the pipeline.

## Sleeper rules

- **One** background sleeper at a time; kill on done, stop, or merge.
- `notify_on_output` regex: `^AGENT_SHIP_PR_WAKE_<PR>`.
- `dry-run`: no sleeper; re-collect immediately between simulated iterations.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "No comments yet — skip 30s/300s" | 30s initial delay (for review Action to start on GitHub) + default 300s heartbeats are mandatory for review Action / CI. |
| "Use ws-goal-fix-pr 2m" | ship-pr uses 30s initial wait + default **300s** heartbeats. |
| "Merge with open threads" | Merge only when `activeThreads == 0` after ws-goal-fix-pr. |
| "Checks still red — merge anyway" | Step 7 requires green required checks. |
| "Skip prepare checklist — CI will catch it" | [PREPARE-CHECKLIST.md](PREPARE-CHECKLIST.md) is mandatory before push/PR. |
| "Squash without asking" | Use `--merge` (merge commit), matching repo history. |
