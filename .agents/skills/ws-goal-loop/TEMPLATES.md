# ws-goal-loop — Templates

Load from [`SKILL.md`](SKILL.md) when writing round or final reports.

## Per-iteration report (`$RUNTIME_DIR/round-<N>.md`)

```markdown
# Goal Loop Round <N>

| Field | Value |
|-------|-------|
| ID | <ID> |
| Iteration | <N>/<MAX_ITERATIONS> |
| Revision | <revision> |
| Blocked reason | <concrete reason or empty> |
| Blocked round count | <consecutive identical reasons, 0–2 or 3+ escalated> |
| Mode | drive / watch |
| Success criterion | <SUCCESS_CRITERION> |
| Criterion met | yes / no |
| Actions taken | <summary> |
| Build/tests | <pass/fail> |
| Commit | <hash> |
| Push | <yes/no> |
```

## Final report

```markdown
# Goal Loop Result — <ID>

| Field | Value |
|-------|-------|
| ID | <ID> |
| Iterations executed | <N> |
| Stop reason | convergence / max iterations / user / escalate / error |
| Criterion met | yes / no |
| Rounds | <summary per round> |
| Final state | <evidence of last collect> |
| URL | <resource URL> |
```

## Sentinel sketch

```bash
RUNTIME_DIR="<resolved runtime dir>"
mkdir -p "$RUNTIME_DIR"
echo "<revision>" > "$RUNTIME_DIR/revision"
echo "<blocked-reason-or-empty>" > "$RUNTIME_DIR/blocked-reason"
echo "goal_loop_wake_<ID>" > "$RUNTIME_DIR/sentinel.pid"
echo $! >> "$RUNTIME_DIR/sentinel.pid"
sleep <WAIT_SECONDS> && echo 'GOAL_LOOP_WAKE_<ID> {"reason":"post-push","id":"<ID>","iteration":<N>}'
```

**AC7–AC8 runtime files (mandatory):** persist `$RUNTIME_DIR/revision` (monotonic per accepted update; stale revision → conflict loudly) and `$RUNTIME_DIR/blocked-reason` (last concrete blocked reason; empty when none). On resume, re-arm the objective and reset the blocked-round counter (clear or rewrite `blocked-reason`).

Prefer `{plansDir}/{slug}/.runtime/` (`{us-dir}/.runtime`). Never OS temp. Never skill-folder `runs/` under `{skillsRoot}` or `{globalSkillsRoot}` (hybrid overwrite + SoT leak).
