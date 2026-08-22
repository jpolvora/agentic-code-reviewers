# Archive contract — ws-spec-archive

Schema, eligibility, sources, and report shape. Load from SKILL.md steps that name this file.

## Index tables

`ws-spec-index` still owns Feature map / Next specs / Inbox / Done-log **status sync**. This skill owns the **Archive** table and may **append** missing Done-log rows for shipped slugs. It does not rewrite AC bodies or auto-write `Verified:`.

### Archive (required heading)

Match `## Archive` or `## N. Delivery archive` (any heading level ≥ 2). Create the section when missing; insert before Maintenance / Related docs when those exist.

| Column | Content |
|--------|---------|
| Slug | backtick slug |
| Outcome | `shipped` · `cancelled` · `failed` · `archived` · `in-progress` |
| Last state | `{status} / step {n}` (or `—`) |
| PR / Commit | `[PR #N](url)` and/or `` `sha7` ``; `—` when unknown |
| Summary | one line; replace `\|` with `/` |

Upsert by slug (replace existing Archive row). Idempotent.

### Done log (append-only)

Template columns `Date | Slug | Title | PR / Commit`. Append a row only when outcome is `shipped` and no Done-log cell already contains the slug. Date = `endedAt` (YYYY-MM-DD) or scan day. Do not delete or reorder existing rows.

### Specs of record

`{specsDir}/*.spec.md` stay. `{us-dir}/step-00-*.spec.md` is a plan artifact and may be deleted with the plan folder after the Archive row exists.

## Eligibility (cleanup)

A `{plansDir}/{slug}/` folder may be deleted only when **all** hold:

1. Inventory marked `eligible: true`.
2. User approved that slug at the gate.
3. Status is `completed` · `cancelled` · `failed`, **or** the folder name contains `.archive`.

Keep: `active` · `paused` · missing state (unless `.archive` folder) · `{specsDir}` · `{sharedDir}` · skill bodies · `{plansDir}/index.json` (prune matching workflow entries; do not delete the file).

## Sources (enrichment order)

1. `{us-dir}/*.state.md` (newest mtime wins).
2. Delivery artifacts: `step-08-*.result.md` / lite `step-04-*.result.md`.
3. `{specsDir}/{slug}.spec.md` title when state title is empty.
4. `git log --all` on the plan path + spec of record, then `--grep={slug}`.
5. `{sharedDir}/CHANGELOG.md` and `{sharedDir}/MEMORY.md` (slug hits; one-line facts only — do not copy MEMORY DO NOT blocks into the index).
6. One SCM provider `sweep-prior-work` when `providers.scm` is set and a PR/issue id is known. Auth failure → gap `scm-skipped`.

Invent nothing. Missing field → `—` or omit from Summary.

## Report

Print after scan + enrichment, before the cleanup gate:

1. **Index writes** — slugs upserted to Archive; Done-log appends; skipped (already present).
2. **Keep** — active/paused plan dirs (path + status).
3. **Cleanup candidates** — eligible `{us-dir}` paths, tracked vs untracked, reason.
4. **Gaps** — `config-missing`, `scm-skipped`, no git hits, unmapped spec.
5. **Proposed commit** — path list (`index.PRD`, deleted plan dirs, pruned `{plansDir}/index.json`) + message.

## Proposed commit message

```text
Archive shipped plan history into index.PRD and remove completed plan dirs.
```

Stage only those paths. Never `git add -A`. Do not run `git commit` until the user confirms the proposal.
