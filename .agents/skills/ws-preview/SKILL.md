---
name: ws-preview
description: External pipeline code-review dry-run on the current branch (optional uncommitted changes) without publishing PR threads.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - ws-preview
  - pipeline-review
  - cursor-reviewer-dry-run
  - exec-code-review
---

# ws-preview

> When this skill is loaded, output "ws-preview loaded."

User-invoked **pipeline review dry-run** via the public cursor-reviewer `run.sh` backend. Complement to [`ws-code-review`](../ws-code-review/SKILL.md) (in-agent pre-push / orch Step 6) — this skill simulates CI-shaped external review output; it does not replace local fix → re-review.

**Always `--dry-run`.** Never publish PR threads. Default includes uncommitted changes; omit `--include-uncommitted` only when the user asks for committed-only.

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

## Invocation

```
/ws-preview [--stack <id>] [--target-branch refs/heads/<branch>] [--model <id>] [--committed-only]
```

| Flag / config | Default | Notes |
|---------------|---------|-------|
| Stack | `config.json` → `preview.stack` if set, else `stack.id` | Pass `--stack` to override |
| Target branch | `refs/heads/{project.baseBranch}` from config | Pass `--target-branch` to override |
| Uncommitted | included | Drop only when user asks committed-only or passes `--committed-only` |
| Backend key | `CURSOR_API_KEY` | Print `yes` / `empty` only — never echo secrets |

## Steps

1. **Prereqs** — From repo root:
   ```bash
   echo "CURSOR_API_KEY set: ${CURSOR_API_KEY:+yes}"
   node -v
   ```
   Resolve stack and target branch from config (table above) or flags.    Verify the target ref exists (use `project.gitRemote` from config, default `origin`):
   ```bash
   git rev-parse --verify {gitRemote}/<baseBranch> || git rev-parse --verify <baseBranch>
   ```
   - Done when: key status is known, Node is ≥ 22.13, and the target branch ref resolves.
   - If the key is unset: stop and tell the user to export `CURSOR_API_KEY`. Print `yes`/`empty` only.

2. **Run** — From repo root, use a long-lived Shell call; set the block timeout to at least 600000 ms (10 minutes) so clone + `npm ci` + LLM is not killed. Keep `--dry-run` on every invocation.
   ```bash
   bash {skillsRoot}/ws-preview/scripts/run_dry_run.sh [--stack <id>] [--target-branch refs/heads/<branch>] [--model <id>] [--committed-only]
   ```
   Append extra flags only when the user asked for them.
   - Done when: the process exits and stdout has the reviewer summary or a hard error. A timeout is a failed run.

3. **Report** — Summarize finding counts and top issues in the consumer/session language (skill body en-us). `exit 0` with findings is a successful dry-run, not a clean review. Stop after the report (fixes only if the user asks).
   - Done when: the user has the summary (or the hard-error cause) and no PR threads were published.

## Runner (v1 backend)

[`scripts/run_dry_run.sh`](scripts/run_dry_run.sh) downloads cursor-reviewer `release` `run.sh`, clones into `.tmp-cursor-reviewer`, runs `npm ci --omit=dev`, executes with `--dry-run --verbose`, and deletes the temp folder after. Diff scope: `{target}...HEAD` plus working tree when `--include-uncommitted` is set.

Optional later: `preview.backend` in config (`cursor-reviewer` | `agentic-code-reviewers`) — not required for v1.
