# ship-pr — examples

## 1. Standard delivery (develop → master)

```
/ship-pr feat(flags): legacy product_analytics wire compat
```

1. On `develop`; `bash .agents/skills/ws-ship-pr/scripts/detect-base-branch.sh` → `main` (or configured `baseBranch`)
2. **Prepare to PR** board: coverage → build → tests → ws-secrets-leak-review → **discover** local prepare/before-push rules (AGENTS / rules.* / CONTRIBUTING) and **wait** until done → show board (all ✅/⏭)
3. Code-review auto-fix until **No feedback** (≤3 rounds) unless orch already reviewed
4. Commit → `git push origin develop` (only if prepare green)
5. Create PR via `providers.scm` (`create-pr` intent)
6. Wait 30s (code-review action start on GitHub infrastructure) → `/ws-goal-fix-pr {pr} max 10` (default 300s heartbeats)
7. Merge via provider `merge-pr` (keep `develop`)

**PR:** `https://github.com/{owner}/{repo}/pull/{n}`

## 2. Dry-run

```
/ship-pr fix(auth): token refresh dry-run
```

Prints base branch, Prepare to PR board (simulated statuses), review plan, PR body — no writes.

## 3. Ship without merge

```
/ship-pr chore(ci): pin api image sha no-merge
```

Stops after ws-goal-fix-pr convergence; PR stays open.

## 4. Override base (rare)

```
/ship-pr hotfix: emergency base=main max 5
```

Only when default detection is wrong; still push from `develop` unless user explicitly changes head.
