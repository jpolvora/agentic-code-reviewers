# ws-goal-fix-pr — Examples

## 1. PR with active threads until convergence

```
/ws-goal-fix-pr 15
```

**Setup**
- PR number: `15` (GitHub)
- Success: `activeThreads == 0`
- Mode: Drive + heartbeat 5m post-push
- Max: 20

**Iteration 1**
1. `gh pr view 15 --json comments` → 3 active threads
2. fix-pr with auto-gates → fixes 2, resolves 1 without code
3. `dotnet test` + code-review → "No feedback"
4. Commit `fix(#15): fix issues from review threads [PRRT_..., ...]` + push
5. Arm `sleep 300` → `AGENT_GOAL_WAKE_fixpr_15`

**Iteration 2** (after wake)
1. `collect` → 1 new thread (reviewer CI)
2. fix-pr round 2 → fixes, push
3. 5m Heartbeat

**Iteration 3**
1. `collect` → `activeThreads: []`
2. **Done** — convergence

---

## 2. Dry-run (without publishing)

```
/ws-goal-fix-pr 15 dry-run
```

- Auto-approved gates; no resolve or `git push`
- No real commit (or discardable local commit, depending on session policy)
- Immediate re-collect (no sleep 5m) between iterations
- Stops when simulation shows 0 threads or `max` is reached

---

## 3. Large PR with limit

```
/ws-goal-fix-pr 15 max 5
```

- Stops at 5th iteration if there are still threads
- Reports remaining IDs for manual continuation or `max 15`

---

## 4. Escalation block

**Iteration 1**
- Thread `PRRT_...`: spec vs comment conflict → classified as **Escalate**
- Goal **stops** without auto-approving
- User decides → resumes with `/ws-goal-fix-pr 15` after alignment

---

## Count active threads (quick check)

```bash
gh pr view 15 --json comments --jq '[.comments[] | select(.isResolved == false)] | length'
```

Exit `0` = convergence; `1` = still has work.
