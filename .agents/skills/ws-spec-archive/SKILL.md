---
name: ws-spec-archive
version: 0.3.30
disable-model-invocation: true
description: >-
  Harvests plansDir delivery facts into specsDir/index.PRD, then proposes
  cleanup of shipped plan folders. Trigger on /ws-spec-archive, archive plans,
  archive index.PRD.
invocation_names:
  - ws-spec-archive
  - spec-archive
  - archive-plans
---

# ws-spec-archive

> When this skill is loaded, output "ws-spec-archive loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check when config is present. Missing config → local-path defaults with gap `config-missing`.

**Archive** `{plansDir}` workflow history into `{specsDir}/index.PRD` so shipped plan folders can be removed without losing delivery facts. Complements [`ws-spec-index`](../ws-spec-index/SKILL.md) (index status sync) and [`ws-cleanup`](../ws-cleanup/SKILL.md) (untracked scratch). Schema → [`references/ARCHIVE.md`](references/ARCHIVE.md).

**Specs family:** Role = harvest plan-folder facts → enrich `index.PRD` Archive (+ missing Done-log rows) → propose cleanup commit. Does not rewrite AC bodies (`ws-sync-spec`) or run the dual board (`ws-spec-list`). Router: [`../ws-shared/autoload.md`](../ws-shared/autoload.md).

## Invocation

```text
/ws-spec-archive
/ws-spec-archive --dry-run
/ws-spec-archive --slug hermes-spec-to-pr-enhancements
archive plans
```

| Arg | Rule |
|-----|------|
| (none) | Scan all `{plansDir}` folders; enrich index; report; gate cleanup |
| `--dry-run` | Scan + report only (no index write, no deletes) |
| `--slug {slug}` | Limit scan to that plan folder |

## Steps

1. **Resolve** — Read `{sharedDir}/config.json`. Expand `{plansDir}` / `{specsDir}` / `{sharedDir}` / `{skillsRoot}` from [`../ws-shared/tools.md`](../ws-shared/tools.md). Changelog path ← `rules.changelogFile` (default `{sharedDir}/CHANGELOG.md`).
   - Done when: roots are fixed (missing config → defaults `.agents/plans`, `.agents/specs`).

2. **Scan** — Run:
   ```bash
   node {skillsRoot}/ws-spec-archive/scripts/scan_plans.cjs --repo-root {repoRoot} --plans-dir {plansDir} --specs-dir {specsDir}
   ```
   Add `--slug {slug}` when requested. Require exit 0 and `ok: true`.
   - Done when: inventory JSON (`plans`, `eligible`, git hits, existing index flags) is in context.

3. **Enrich** — For each plan, fill `summary` / `prDisplay` / `commitSha` from inventory first, then Grep changelog + `{sharedDir}/MEMORY.md` for the slug, then `git log` hits already in the JSON. If `providers.scm` is set and a PR/issue id is known, load **one** provider and call `sweep-prior-work` (keywords = slug + title). Auth failure → gap `scm-skipped`. Write the enriched inventory to a short uncommitted temp JSON.
   - Done when: every plan has outcome + one-line summary or `—`; gaps listed; temp inventory on disk.

4. **Preview index** — Run:
   ```bash
   node {skillsRoot}/ws-spec-archive/scripts/apply_archive.cjs --repo-root {repoRoot} --inventory-file {enriched.json} --write-index --dry-run
   ```
   Print ARCHIVE.md **Report** sections (index writes, keep, cleanup candidates, gaps, proposed commit).
   - Done when: report shown with `proposedCommit.files` and message.

5. **Gate** — `user-gate` (host structured choice; markdown fallback). Cancel / dismiss → HS-1 (never infer yes):
   1. **Write index.PRD only** (recommended)
   2. **Write index.PRD + delete eligible plan dirs** (then propose commit)
   3. **Dry-run only** — stop; no writes
   `--dry-run` invocation skips this gate and stops after step 4.
   - Done when: one option is chosen, or skill stopped.

6. **Apply** — On option 1 or 2, after explicit confirm:
   ```bash
   node {skillsRoot}/ws-spec-archive/scripts/apply_archive.cjs --repo-root {repoRoot} --inventory-file {enriched.json} --write-index --confirm
   ```
   Option 2 adds `--delete-plans --slugs-file {approved.json}` listing only eligible approved slugs. Delete the temp JSON files after. Require exit 0 and `ok: true`.
   - Done when: `index.PRD` contains Archive rows for scanned slugs; option 2 deleted only approved eligible `{us-dir}` paths; `{specsDir}/*.spec.md` still exist.

7. **Propose commit** — Print `proposedCommit` (files + message from ARCHIVE.md). Stage list = those files only. Stop. Run `git commit` only if the user confirms the proposal in this turn.
   - Done when: proposal printed; commit executed only after explicit yes, otherwise skill stops.

## Rules

- Path tokens only.
- Positive enclosure: delete only inventory `eligible` slugs under `{plansDir}` re-checked by `apply_archive`.
- `{specsDir}/*.spec.md` stay. Active / paused plan dirs stay.
- Reuse SCM provider intents; do not duplicate auth recipes.
- After archive, leftover scratch (telemetry / `.runtime`) still goes through `ws-cleanup`.
