# ws-azure-devops-provider — Intent procedures

Load when executing an intent from [`SKILL.md`](SKILL.md). Shared intent ids: [`../ws-shared/scm-provider-contract.md`](../ws-shared/scm-provider-contract.md). Expand `{plansDir}` (`plans.dir`, default `.agents/plans`) and `{specsDir}` (`plans.specsDir`, default `.agents/specs`) from config. Resolve `{org}` / `{project}` / `{apiBase}` / `{patEnvVar}` from `issueTrackers.azureDevOps` — never consumer literals.

## `validate-auth`

1. Read `org`, `project`, `apiBase`, `patEnvVar` from `issueTrackers.azureDevOps` in `{sharedDir}/config.json`.
2. Resolve PAT: env named by `patEnvVar` → `ADO_PAT` → `AZURE_DEVOPS_PAT` (legacy file secret only if env empty and legacy config path exists).
3. If org/project missing or PAT empty → print fix instructions; **STOP**.
4. Optional smoke: GET `{apiBase}/{org}/{project}/_apis/wit/fields/System.State?api-version=7.1` with Basic auth (empty user + PAT), or `fix_pr_azure_context.py` smoke.

## `fetch-to-spec`

| Input | Org/project | Slug |
|-------|-------------|------|
| `ADO {id}` / `WI {id}` | config tracker | `us-{id}` |
| `{org}/{project}#{id}` | parsed (must match tracker) | `us-{id}` |
| ADO work-item URL | parsed from URL | `us-{id}` |

**Three ordered phases — fetch snapshot, reformulate & enhance via `ws-write-spec` to `{specsDir}`, then register workflow copy in `{plansDir}` via `ws-local-spec-provider`.** Never write `step-00` directly from the converter.

```bash
mkdir -p {plansDir}/us-{id}

# 1. Fetch raw work-item snapshot
python .agents/skills/ws-azure-devops-provider/scripts/ado-workitem-to-spec.py \
  --org {org} --project {project} --id {id} \
  --api-base {apiBase} --pat-env {patEnvVar} \
  --snapshot {plansDir}/us-{id}/step-00-us-{id}.issue.json

# 2. Spec of record → {specsDir}/us-{id}.spec.md (enhanced via ws-write-spec; resolves plans.specsDir)
# Base converter or ws-write-spec parses the snapshot and builds an agentic-enhanced spec:
# (ado-workitem-to-spec.py emits the base spec of record; ws-write-spec enhances with agentic ACs)

# 3. Workflow copy → {plansDir}/us-{id}/step-00-us-{id}.spec.md (keeps source: azure-devops)
node .agents/skills/ws-local-spec-provider/scripts/register_local_spec.cjs \
  --input {specsDir}/us-{id}.spec.md --source azure-devops
```

| Note | Detail |
|------|--------|
| Raw snapshot JSON | Audit artifact only — stays under `{us-dir}`; downstream steps never read it |
| Agentic Reformulation | `ws-write-spec` reformulates and enhances raw work item descriptions into unambiguous, testable ACs while preserving human text in `## Original Issue Context` |
| Re-fetch over an existing run | The converter (Step 2) refuses first when the spec of record differs (`--force` on the converter), and Step 3 refuses when `step-00` differs (`--force` on register); re-run with `--force` after confirming |
| Explicit paths | `--output` (converter) / `--specs-dir` / `--plans-dir` (register) override the config-resolved defaults |
| Promotion owner | `register_local_spec.cjs` from [ws-local-spec-provider](../ws-local-spec-provider/SKILL.md) is the invoked promotion primitive for every provider; Python equivalent remains supported |


## `sweep-prior-work`

```bash
python .agents/skills/ws-azure-devops-provider/scripts/sweep_prior_work.py \
  --issue {id} \
  --keywords {k1} {k2} \
  --files path/to/file1
```

- Run `validate-auth` first (org/project + PAT from config). Missing PAT without `--dry-run` → **STOP** (no silent GitHub fallback).
- `--dry-run` without auth: print skip reason, exit 0 (advisory).
- Search PRs by title/description text and related work-item links; `git log --oneline -20 -- <files>` when `--files` set.
- stdout JSON (repo-relative paths only). Exact open PR for the **same tracker id** → caller `user-gate`.

## `create-pr`

Prefer Azure CLI:

```bash
az repos pr create \
  --organization "https://dev.azure.com/{org}" \
  --project "{project}" \
  --repository "{repository}" \
  --source-branch {head} \
  --target-branch {base} \
  --title "{title}" \
  --description "{body}"
```

`{repository}` from remote / project config. Reuse open PR for same source→target when present. REST equivalent OK when `az` unavailable (same PAT + org/project). On Windows / PowerShell prefer a description file or single-quoted body (same quoting trap as GitHub `--body-file`).

## `list-threads`

```bash
python .agents/skills/ws-azure-devops-provider/scripts/fix_pr_azure_context.py collect \
  --pr-id {PR_ID} \
  --output .agents/skills/ws-fix-pr/runs/pr-{PR_ID}/context.json
```

Return structured threads to `ws-fix-pr` / `ws-goal-fix-pr`. Active count = `len(activeThreads)`. Collect prints `collect-summary:` on stderr. `context.json` is UTF-8 — on Windows re-read with `encoding="utf-8"`.

## `check-pr-status`

```bash
az repos pr policy list --id {PR_ID} --organization "https://dev.azure.com/{org}" --project "{project}"
```

- Evaluates build pipelines and status policies for `{PR_ID}`.
- Finished when all status policies and build pipelines report completed status (`approved`/`succeeded`/`failed`, not active/running).
- On failed build/policy: fetch build log via REST or `az pipelines runs show --id {runId}`.
- Classify each failed check: **`diff-regression`**, **`baseline`** (reproduced on `project.baseBranch`), **`infra-flake`** (one rerun only).
- Record classification for callers. Baseline failures do not block merge only when reproduced on default branch and recorded.

## `comment-issue`

Alias in [`tools.md`](../ws-shared/tools.md): `close-loop`.

```bash
python .agents/skills/ws-azure-devops-provider/scripts/comment_issue.py \
  --id {id} \
  --body-file {plansDir}/close-loop-body.md \
  [--dry-run]
```

- POST `{apiBase}/{org}/{project}/_apis/wit/workItems/{id}/comments?api-version=7.1` (WIT comment, not PR thread).
- Skip when tracker `id` is null. `--dry-run` prints body, no POST.
- `validate-auth` before mutating.

## `resolve-thread`

```bash
python .agents/skills/ws-azure-devops-provider/scripts/fix_pr_azure_context.py resolve-thread \
  --pr-id {PR_ID} \
  --thread-id {THREAD_ID} \
  --comment "{resolution note}" \
  [--model {model}] \
  [--dry-run]
```

`--model` is optional host metadata (footer). Omit it when the caller does not have a session model id. Pass `--dry-run` when parent is dry-run; skip remote mutation.

## `merge-pr`

1. Wait for required policies / PR status (mirror GitHub checks watch).
2. Complete:

```bash
az repos pr update --id {PR_ID} --status completed \
  --organization "https://dev.azure.com/{org}" \
  --project "{project}"
```

Do **not** delete the configured working branch after completion.
