---
name: ws-fix-pr
description: Single-pass PR thread fixer — resolves active GitHub or ADO PR review threads, applying targeted code fixes and posting progress reports.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - fix-pr
  - ws-fix-pr
---

# ws-fix-pr

> When this skill is loaded, output "ws-fix-pr loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Fetch, score, and systematically resolve active PR review threads on GitHub or Azure DevOps: local fixes, test validation, thread resolution, and push back to the remote branch.

Platform I/O (`list-threads`, `resolve-thread`) is **delegated** to the skill selected by `providers.scm`: never hardcode a single-host happy path here. See [README.md](README.md) for platform support, flow summary, and fix checklist.

## Invocation

Standalone:

```
/fix-pr <PR-ID> [dry-run]
```

Workflow (called by [ws-goal-fix-pr](../ws-goal-fix-pr/SKILL.md)): all interactive gates are auto-approved by the goal loop; receives `PR-ID` and `dry-run` from the goal.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<PR-ID>` | required | Target Pull Request number |
| `dry-run` | false | Simulate fixes/resolutions; no commits, pushes, or remote thread mutations |

## Prerequisites

- Local branch checked out matches the PR source branch.
- `{sharedDir}/config.json` with resolvable `providers.scm` (`github` \| `azure-devops`, never `local`): see [config-resolution.md](../ws-shared/config-resolution.md).
- Provider skill's `validate-auth` passes before mutating remote threads.

## SCM provider resolution

Resolve per [config-resolution.md](../ws-shared/config-resolution.md): read `providers.active` / `providers.scm`; if absent, prefer an enabled GitHub tracker, else Azure DevOps; reject `scm: "local"`.

| `providers.scm` | Skill | Intents used here |
|-----------------|-------|-------------------|
| `github` | [ws-github-provider](../ws-github-provider/SKILL.md) | `list-threads`, `resolve-thread`, `check-pr-status` |
| `azure-devops` | [ws-azure-devops-provider](../ws-azure-devops-provider/SKILL.md) | `list-threads`, `resolve-thread`, `check-pr-status` |

## Steps

1. **Sync & CI check**: `git pull origin <sourceRefName>`; refuse dirty worktrees; dispatch provider **`check-pr-status`** and inspect failed-check logs before formulating CI-driven fixes. Do not "fix" baseline noise reproduced on `project.baseBranch`; route diff-regression to surgical fixes. One infra-flake rerun only (via `check-pr-status` output).
   - Done when: worktree is clean and current with the source branch; CI triage recorded.

2. **Fetch active threads**: resolve `providers.scm` and call `list-threads` for `<PR-ID>`. Parse `threadId`, `filePath`, `lineNumber`, `comments`. Use the payload's `activeThreads` count directly; do not re-filter raw statuses. If reading any collect `--output` file, open with UTF-8 explicitly (bare `open(path)` on Windows raises `UnicodeDecodeError` on review text).
   - Done when: every active thread has parsed file/line/comment context.

3. **Score & classify**: rate each thread 0–10.
   - Done when: every thread has a score and an action:

   | Score | Action |
   |-------|--------|
   | 0–5 | Resolve with a comment justifying no code change |
   | 6–10 | Apply a surgical code fix |

4. **Confirmation gate**: save the proposed fix checklist to `{skillsRoot}/ws-fix-pr/runs/pr-<PR-ID>/plan-gate.md` (uncommitted) and ask: "Proceed with fixes for threads [ID1, ID2]?" Under [ws-goal-fix-pr](../ws-goal-fix-pr/SKILL.md), auto-yes (save gate file and proceed).
   - Done when: checklist confirmed by user, or auto-approved by the goal loop.

5. **Surgical fix (defect class)**: for each blocking thread, name the defect class, then follow [`scripts/COOPERATIVE_FIX.md`](scripts/COOPERATIVE_FIX.md) sibling sweep (repo-wide grep; include paths the thread already named). Apply minimal edits that fix every in-scope occurrence, not only the anchored `file:line`. Record `siblingsFixed` / `siblingsSkipped` (path + reason) on the plan-gate and in the resolution comment.
   - Done when: all approved threads have class-wide fixes or a resolution comment that names remaining exemptions.

6. **Verify & push**: run `config.json.verification` commands; write the review report under `{reviewsDir}/PR-<PR-ID>-round-<N>.md` (`{reviewsDir}` ← `config.reviews.dir`); resolve each handled thread via provider intent `resolve-thread` (skip remote mutation when `dry-run`) with a `<!-- resolution-reply -->` marker in the comment body; stage, commit, and `git push origin HEAD` (skip push when `dry-run`).
   - Done when: verification passed, report exists, threads are resolved (or dry-run simulated), and the branch is pushed (unless `dry-run`).

## Runtime audit (`defaults.enableAuditing`)

When `config.json` → `defaults.enableAuditing` resolves to `true` (see [`config-resolution.md`](../ws-shared/config-resolution.md)), follow [`ws-audit`](../ws-audit/SKILL.md):
- **Inherit or Init:** in workflow mode, inherit the active orchestrator audit session (`{us-dir}`); in standalone mode, initialize a session under `{plansDir}/pr-{PR-NUMBER}`.
- **Catch script errors:** whenever any provider script (`fix_pr_azure_context.py`, `fetch_threads.cjs`, `resolve_thread.cjs`, SCM CLI helpers) or verification script fails or exits non-zero, append a finding (`category: "script"`, `severity: "error"`, capturing command line, stdout, stderr, and `recovered: true/false`).
- **Finalize & gate:** when running standalone, finalize the audit session at completion/stop and present the upstream issue gate if errors occurred.
