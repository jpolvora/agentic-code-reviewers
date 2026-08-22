---
name: ws-github-provider
description: GitHub issue→spec and PR ops. Same required intents as Azure DevOps (scm-provider-contract). Trigger when providers.scm is github.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - github-provider
  - ws-github-provider
---

# ws-github-provider

> When this skill is loaded, output "ws-github-provider loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Integrate GitHub Issues and Pull Requests with workflow-skills. Pipeline skills (`ws-write-spec`, `ws-ship-pr`, `ws-fix-pr`, `ws-goal-fix-pr`, `ws-spec-to-pr`) link here instead of embedding `gh` recipes or API calls.

## Invocation

### Standalone Mode

```
/ws-github-provider <intent> [args...]
```

Examples: `fetch-to-spec 2416` · `validate-auth` · `create-pr --head develop --base main` · `list-threads 42` · `merge-pr 42`.

### Workflow Mode

Orch entry / `ws-fix-pr` / `ws-goal-fix-pr` / `ws-ship-pr` pass intent + args when `providers.active` or `providers.scm` is `github`; gates follow the parent.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<intent>` | required | Contract table below |
| ids | per intent | Tracker/SCM ids — not baked into config for other repos |
| `dry-run` | false | Simulate when caller supports it |

## Prerequisites

- `gh` on `PATH`; `gh auth status` for CLI flows.
- GraphQL threads: `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` → `GITHUB_TOKEN` → `GH_TOKEN` → `gh auth token` fallback.
- Config: `issueTrackers.github` and/or `providers.active` / `providers.scm` = `github`.

Auth failure → **STOP** with `validate-auth` fixes. No silent provider fallback.

## Intent contract

Shared ids and guarantees: [`scm-provider-contract.md`](../ws-shared/scm-provider-contract.md). This table is the GitHub mapping. Do not add an intent here without the same intent on [`ws-azure-devops-provider`](../ws-azure-devops-provider/SKILL.md) (or an allowlist row).

| Intent | Input | Output | Implementation |
|--------|-------|--------|----------------|
| `fetch-to-spec` | Issue id / URL | **1.** `{specsDir}/us-{n}.spec.md` (agentic spec of record via `ws-write-spec`) → **2.** `{us-dir}/step-00-us-{n}.spec.md` (workflow copy, `source: github`) + optional `*.issue.json` snapshot | provider fetch → `ws-write-spec` (reformulate/enhance) → `register_local_spec.cjs` |
| `sweep-prior-work` | issue id (optional), keywords, files (optional) | JSON: PR search hits + `git log` | `sweep_prior_work.py` |
| `validate-auth` | none | Pass/fail + fixes | `gh auth status` + thread token note |
| `create-pr` | head, base, title/body | PR URL + id | `gh pr create` (reuse open head→base) |
| `list-threads` | PR id | Thread list | `fetch_threads.cjs` |
| `check-pr-status` | PR id | CI status + per-failed-check triage | `gh pr checks`; on fail `gh run view --log-failed`; classify diff/baseline/flake; one flake rerun |
| `resolve-thread` | thread id (+ comment) | Resolved (`isResolved: true` via `resolveReviewThread` GraphQL mutation) | `resolve_thread.cjs` |
| `comment-issue` | issue id, body | Public issue comment (alias `close-loop`) | `comment_issue.py` → `gh issue comment` |
| `merge-pr` | PR id | Merged | `gh pr checks --watch` then `gh pr merge --merge` |

**Spec path rule:** `fetch-to-spec` **always** writes the agentic-enhanced `{specsDir}/{slug}.spec.md` first (via `ws-write-spec` derived from the fetched issue), then promotes it to `{us-dir}/step-00-{slug}.spec.md` via [ws-local-spec-provider](../ws-local-spec-provider/SKILL.md) `register_local_spec.cjs --source github`. Never write `step-00` straight from the converter, and never skip the `{specsDir}` copy.

**Branch rule:** never `--delete-branch` when head is `project.workingBranch` (default `develop`).

**Procedures:** load [`INTENTS.md`](INTENTS.md) for the intent being run.

## Canonical scripts

Prefer these paths (legacy orch/fix-pr shims may forward here):

| Script | Path |
|--------|------|
| Issue snapshot / base conversion | `{skillsRoot}/ws-github-provider/scripts/github-issue-to-spec.py` (default output `{specsDir}/us-{n}.spec.md`) |
| Spec of record → workflow copy | `node {skillsRoot}/ws-local-spec-provider/scripts/register_local_spec.cjs --source github` |
| List threads | `{skillsRoot}/ws-github-provider/scripts/fetch_threads.cjs` |
| Resolve thread | `{skillsRoot}/ws-github-provider/scripts/resolve_thread.cjs` |
| Prior-work sweep | `{skillsRoot}/ws-github-provider/scripts/sweep_prior_work.py` |
| Comment on issue | `{skillsRoot}/ws-github-provider/scripts/comment_issue.py` |

Optional: `issueTrackers.github.issueToSpecScript` must still resolve to the converter.

## Config keys

| Key | Role |
|-----|------|
| `providers.active` / `providers.scm` | `github` → this skill |
| `issueTrackers.github` | enabled, org/repo, optional `issueToSpecScript` |
| `project.workingBranch` / `baseBranch` / `gitRemote` | create/merge defaults |
| `plans.specsDir` | `{specsDir}` — spec of record written by `fetch-to-spec` (default `.agents/specs`) |
| `plans.dir` | `{us-dir}` root for the workflow copy |

Legacy: absent `providers.*` → GitHub default when `issueTrackers.github.enabled`.

## Dependencies

[ws-spec-to-pr](../ws-spec-to-pr/SKILL.md) · [ws-ship-pr](../ws-ship-pr/SKILL.md) · [ws-fix-pr](../ws-fix-pr/SKILL.md) · [ws-goal-fix-pr](../ws-goal-fix-pr/SKILL.md) · [ws-spec-format](../ws-spec-format/SKILL.md) · [ws-write-spec](../ws-write-spec/SKILL.md) · [ws-local-spec-provider](../ws-local-spec-provider/SKILL.md) (spec registration)

## Done when

- Intent from the contract table completed with cited CLI/script exit 0 (or dry-run simulation recorded).
- `fetch-to-spec`: `{specsDir}/{slug}.spec.md` exists (enhanced via `ws-write-spec`) **and** `{us-dir}/step-00-{slug}.spec.md` was registered with `source: github`.
- Auth failures STOP with `validate-auth` remediation (no silent fallback).

