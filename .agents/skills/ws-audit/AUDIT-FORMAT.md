# Runtime audit log format

Referenced by [`SKILL.md`](SKILL.md). Finding schema for `{us-dir}/audit-{slug}-{timestamp}.log.md`.

## Log file

- Path: `{us-dir}/audit-{slug}-{ISO8601}.log.md`
- Language: en-us
- Append-only during run; finalized at workflow end

## Finding fields

| Field | Required | Values |
|-------|----------|--------|
| `timestamp` | yes | ISO-8601 UTC |
| `step` | yes | Orch step id (0–9) or `bootstrap` / `finalize` |
| `skill` | no | `ws-*` skill id when known |
| `category` | yes | `script` \| `tool` \| `io-validation` \| `dispatch` \| `disposable-script` \| `performance` \| `correctness` \| `optimization` \| `other` |
| `severity` | yes | `error` \| `unusual` \| `suggestion` \| `opportunity` \| `info` |
| `summary` | yes | One-line description |
| `evidence` | no | Short excerpt (stdout, stderr, path, command, gate id) |
| `language` | no | Programming language (e.g. `python`, `node`, `bash`, `powershell`) when reporting a `disposable-script` |
| `targetAbstraction` | no | Proposed upstream script or utility abstraction (e.g. `ws-diff-filter`, companion script) |
| `recommendation` | no | Specific actionable improvement recommendation |
| `recovered` | yes | `true` if model/workflow recovered after the anomaly |

**Critical rule:** `recovered: true` does **not** suppress the finding when skill content was wrong.

## Markdown body template

Each finding is a `### Finding` subsection with a bullet list of fields.

At workflow finalization, the audit log appends:
1. `## Improvement Opportunities & Reusable Tooling` (when `suggestion`, `disposable-script`, `performance`, `correctness`, or `optimization` findings exist)
2. `## Summary` with totals for errors, unusual findings, suggestions/opportunities, disposable scripts detected, and overall findings.

## Issue drafts

- **Execution errors:** When `severity: error` count ≥ 1 at finalize, `draftIssueBody` builds a GitHub issue title + body for skill defect fixes on the upstream repo (`skill-dependencies.json` → `upstream.repo`).
- **Reusable tooling & performance suggestions:** When actionable suggestions or disposable scripts exist, `draftSuggestionsIssueBody` (CLI: `draft-suggestions-issue` or `draft-issue --type suggestion`) builds a structured GitHub issue proposing pre-generated upstream scripts and orchestrator optimizations.

