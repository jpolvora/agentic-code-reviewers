---
name: ws-azure-devops-provider
description: Azure DevOps work-item→spec and PR ops. Same required intents as GitHub (scm-provider-contract). Trigger when providers.scm is azure-devops.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - azure-devops-provider
  - ws-azure-devops-provider
---

# ws-azure-devops-provider

> When this skill is loaded, output "ws-azure-devops-provider loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Integrate Azure DevOps Work Items and Pull Requests with workflow-skills. Pipeline skills (`ws-write-spec`, `ws-ship-pr`, `ws-fix-pr`, `ws-goal-fix-pr`, `ws-spec-to-pr`) link here instead of embedding `az` / REST recipes.

## Invocation

### Standalone Mode

```
/ws-azure-devops-provider <intent> [args...]
```

Examples: `fetch-to-spec 12345` · `validate-auth` · `create-pr --head develop --base main` · `list-threads 42` · `merge-pr 42`.

### Workflow Mode

Orch entry / `ws-fix-pr` / `ws-goal-fix-pr` / `ws-ship-pr` pass intent + args when `providers.active` or `providers.scm` is `azure-devops`; gates follow the parent.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<intent>` | required | Contract table below |
| ids | per intent | ADO WI / PR ids |
| `dry-run` | false | Simulate when caller supports it |

## Prerequisites

- Prefer Azure CLI (`az`) + DevOps extension for PR create/merge.
- PAT: `issueTrackers.azureDevOps.patEnvVar` (default `ADO_PAT`) → `ADO_PAT` → `AZURE_DEVOPS_PAT`. Never commit tokens.
- Config: `issueTrackers.azureDevOps` with `org` / `project`, and/or `providers.*` = `azure-devops`.
- Legacy fallback only: if tracker fields missing, scripts may read `.agents/skills/azure-devops/azure-devops.config.json` when that path exists — do not recreate that layout for new consumers.

Auth/config failure → **STOP**. No silent provider fallback.

## Intent contract

Shared ids and guarantees: [`scm-provider-contract.md`](../ws-shared/scm-provider-contract.md). This table is the Azure DevOps mapping. Do not add an intent here without the same intent on [`ws-github-provider`](../ws-github-provider/SKILL.md) (or an allowlist row).

| Intent | Input | Output | Implementation |
|--------|-------|--------|----------------|
| `fetch-to-spec` | `ADO {id}`, `WI {id}`, `{org}/{project}#{id}`, or URL | **1.** `{specsDir}/us-{id}.spec.md` (agentic spec of record via `ws-write-spec`) → **2.** `{us-dir}/step-00-us-{id}.spec.md` (workflow copy, `source: azure-devops`) + optional JSON snapshot | provider fetch → `ws-write-spec` (reformulate/enhance) → `register_local_spec.cjs` |
| `sweep-prior-work` | issue id (optional), keywords, files (optional) | JSON: PR search hits + `git log` | `sweep_prior_work.py` |
| `validate-auth` | none | Pass/fail + fixes | Org/project + PAT; optional WIT smoke |
| `create-pr` | head, base, title/body | PR URL + id | Prefer `az repos pr create`; if `az` missing/fails → REST in INTENTS.md |
| `list-threads` | PR id | Thread list | `fix_pr_azure_context.py collect` |
| `check-pr-status` | PR id | CI status + per-failed-check triage | `az repos pr policy list`; build log via REST or `az pipelines runs show`; classify diff/baseline/flake |
| `resolve-thread` | thread id (+ PR id, comment) | Resolved (or dry-run) | `fix_pr_azure_context.py resolve-thread` |
| `comment-issue` | work item id, body | WIT comment (alias `close-loop`) | `comment_issue.py` → WIT Comments `api-version=7.1` |
| `merge-pr` | PR id | Merged | Wait policies then `az repos pr update --status completed` |

**Spec path rule:** `fetch-to-spec` **always** writes the agentic-enhanced `{specsDir}/{slug}.spec.md` first (via `ws-write-spec` derived from the fetched work item), then promotes it to `{us-dir}/step-00-{slug}.spec.md` via [ws-local-spec-provider](../ws-local-spec-provider/SKILL.md) `register_local_spec.cjs --source azure-devops`. Never write `step-00` straight from the converter, and never skip the `{specsDir}` copy.

**Branch rule:** never delete `project.workingBranch` (default `develop`) after merge.

**Procedures:** load [`INTENTS.md`](INTENTS.md) for the intent being run.

## Canonical scripts

Prefer these paths (legacy orch/fix-pr shims may forward here):

| Script | Path |
|--------|------|
| Work item snapshot / base conversion | `{skillsRoot}/ws-azure-devops-provider/scripts/ado-workitem-to-spec.py` (default output `{specsDir}/us-{id}.spec.md`) |
| Spec of record → workflow copy | `node {skillsRoot}/ws-local-spec-provider/scripts/register_local_spec.cjs --source azure-devops` |
| Thread ops | `{skillsRoot}/ws-azure-devops-provider/scripts/fix_pr_azure_context.py` |
| Prior-work sweep | `{skillsRoot}/ws-azure-devops-provider/scripts/sweep_prior_work.py` |
| Comment on work item | `{skillsRoot}/ws-azure-devops-provider/scripts/comment_issue.py` |

## Config keys

| Key | Role |
|-----|------|
| `providers.active` / `providers.scm` | `azure-devops` → this skill |
| `issueTrackers.azureDevOps` | enabled, `org`, `project`, `patEnvVar` |
| `project.workingBranch` / `baseBranch` / `gitRemote` | create/merge defaults |
| `plans.specsDir` | `{specsDir}` — spec of record written by `fetch-to-spec` (default `.agents/specs`) |
| `plans.dir` | `{us-dir}` root for the workflow copy |

## Dependencies

[ws-spec-to-pr](../ws-spec-to-pr/SKILL.md) · [ws-ship-pr](../ws-ship-pr/SKILL.md) · [ws-fix-pr](../ws-fix-pr/SKILL.md) · [ws-goal-fix-pr](../ws-goal-fix-pr/SKILL.md) · [ws-spec-format](../ws-spec-format/SKILL.md) · [ws-write-spec](../ws-write-spec/SKILL.md) · [ws-local-spec-provider](../ws-local-spec-provider/SKILL.md) (spec registration)

## Done when

- Intent from the contract table completed with cited CLI/script exit 0 (or dry-run simulation recorded).
- `fetch-to-spec`: `{specsDir}/{slug}.spec.md` exists (enhanced via `ws-write-spec`) **and** `{us-dir}/step-00-{slug}.spec.md` was registered with `source: azure-devops`.
- Auth/config failures STOP (no silent fallback).
