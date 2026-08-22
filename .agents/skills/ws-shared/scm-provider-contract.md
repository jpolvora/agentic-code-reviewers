# SCM provider feature contract

**Audience: agents** implementing or extending [`ws-github-provider`](../ws-github-provider/SKILL.md) and [`ws-azure-devops-provider`](../ws-azure-devops-provider/SKILL.md).

GitHub and Azure DevOps are **interchangeable SCM backends**. Orchestrators, [`ws-ship-pr`](../ws-ship-pr/SKILL.md), [`ws-fix-pr`](../ws-fix-pr/SKILL.md), and [`ws-goal-fix-pr`](../ws-goal-fix-pr/SKILL.md) call intents **by name**. Host CLI recipes stay inside each provider's `INTENTS.md`. Do not embed `gh` or `az` in those callers.

[`ws-local-spec-provider`](../ws-local-spec-provider/SKILL.md) implements `fetch-to-spec` / `validate-auth` only and **delegates** PR intents to `providers.scm`. Local is not an SCM implementer. Reject `scm: "local"` for PR/thread/merge.

**Parity check:** `node test/test-provider-parity.js` (also `npm run test`). Missing required intent, or an extra intent on one SCM without the other (and without an allowlist row) → fail.

---

## SCM implementers

| Skill folder | `providers.scm` | Procedures |
|--------------|-----------------|------------|
| `ws-github-provider` | `github` | [`../ws-github-provider/INTENTS.md`](../ws-github-provider/INTENTS.md) |
| `ws-azure-devops-provider` | `azure-devops` | [`../ws-azure-devops-provider/INTENTS.md`](../ws-azure-devops-provider/INTENTS.md) |

---

## Required intents

Every implementer `SKILL.md` intent table and `INTENTS.md` `## \`intent\`` heading **must** include these ids. Host mapping (CLI/script) differs; behavior does not.

| Intent | Input | Output | Behavioral guarantee |
|--------|-------|--------|----------------------|
| `validate-auth` | none | Pass/fail + fixes | STOP on failure. No silent provider fallback. |
| `fetch-to-spec` | Tracker id / URL | `{specsDir}` spec of record, then `{us-dir}/step-00` workflow copy | Write `{specsDir}` first via `ws-write-spec`. Register with `ws-local-spec-provider`. Never write `step-00` from the converter. |
| `create-pr` | head, base, title/body | PR URL + id | Reuse an existing open PR for the same head→base when present. |
| `list-threads` | PR id | Structured threads | Include thread id, path, line, comments, and an active count for `ws-fix-pr` / `ws-goal-fix-pr`. |
| `sweep-prior-work` | issue id (optional), keywords, files (optional) | Prior PR hits + recent commits JSON | Run before plan/code; stdout uses repo-relative paths only; `validate-auth` first; advisory `dry-run` when auth missing (GitHub). |
| `check-pr-status` | PR id | CI / policy / review-run status + triage | Finished when none are pending, in progress, or queued. On failure: fetch failed-check logs (`gh run view --log-failed` or ADO build log), classify each failed check as `diff-regression`, `baseline` (reproduced on `project.baseBranch`), or `infra-flake`; at most one flake rerun; record classification and whether rerun was used. |
| `resolve-thread` | thread id (+ comment; PR id when the host requires it) | Resolved | Skip remote mutation when the caller is `dry-run`. |
| `comment-issue` | tracker id, body (PR URL + summary) | Comment posted (alias `close-loop` in tools.md only) | Skip when `id` is null / `source: local` (exit 0 `skipped`). `dry-run` prints body, no POST. WIT Comments `api-version=7.1` on ADO (not PR threads). |
| `merge-pr` | PR id | Merged | Wait for required checks or policies, then merge. Never delete `project.workingBranch`. |

---

## Shared rules

1. **Entry check:** Follow [`config-resolution.md`](config-resolution.md) § Entry check.
2. **Spec path order:** `fetch-to-spec` always writes `{specsDir}/{slug}.spec.md` first, then `{us-dir}/step-00-{slug}.spec.md`.
3. **No silent fallback:** auth or SCM resolution failure → STOP. Do not switch GitHub ↔ Azure without the user.
4. **Working branch:** never delete `project.workingBranch` (default `develop`) after merge.
5. **Dry-run:** `resolve-thread` (and any other mutating intent) must skip remote writes when the parent is `dry-run`.
6. **New intent:** add it to **both** implementers in the same change, or add an allowlist row below with a reason that the host cannot mirror it.

---

## Provider-specific allowlist

Intents that may exist on only one SCM. Keep empty unless a host capability cannot be mirrored.

| Intent | Allowed on | Reason |
|--------|------------|--------|
| _(none)_ | | |

---

## Adding an intent

1. Add a row to **Required intents** (preferred) or **Provider-specific allowlist**.
2. Add the intent to both `SKILL.md` tables and both `INTENTS.md` procedure headings (unless allowlisted).
3. Run `node test/test-provider-parity.js`.
4. Keep callers (`ws-ship-pr`, `ws-fix-pr`, `ws-goal-fix-pr`, orch) intent-name only.
