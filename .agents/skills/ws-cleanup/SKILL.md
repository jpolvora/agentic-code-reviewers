---
name: ws-cleanup
version: 0.3.30
disable-model-invocation: true
description: >-
  Lists disposable workflow leftovers (telemetry, .runtime, fix-pr temps,
  codereview PR*.md, shipped plan dirs), confirms via user-gate, then deletes
  only approved untracked paths. Suggests missing .gitignore patterns. Trigger
  on /ws-cleanup, cleanup workflow, or clean plan leftovers.
invocation_names:
  - ws-cleanup
  - cleanup
  - clean-up
---

# ws-cleanup

> When this skill is loaded, output "ws-cleanup loaded."

Interactive cleanup of **workflow disposable** files. Never deletes product source, tracked git files, skill bodies, or consumer hub data (`config.json`, MEMORY, STACK). History-preserving removal of shipped `{plansDir}` folders (after `index.PRD` Archive) is [`ws-spec-archive`](../ws-spec-archive/SKILL.md).

Phase A git runtime (`uswf/` worktrees/tags) stays in [`ws-spec-to-pr/protocols/artifact-cleanup.md`](../ws-spec-to-pr/protocols/artifact-cleanup.md) — this skill does **not** replace it.

Patterns → [`references/PATTERNS.md`](references/PATTERNS.md).

## Invocation

```text
/ws-cleanup
/ws-cleanup --scratch-only
/ws-cleanup --slug us-217
cleanup workflow leftovers
```

| Arg | Rule |
|-----|------|
| (default) | Scratch, shipped/cancelled/failed plan dirs, and untracked orphans under partially tracked shipped plans |
| `--scratch-only` | Telemetry / `.runtime` / audit logs / temps only (keep plan roots and shipped orphans) |
| `--slug {slug}` | Limit scan to `{plansDir}/{slug}/` |

## Steps

1. **Resolve roots** — Expand `{plansDir}` / `{reviewsDir}` / `{sharedDir}` / `{skillsRoot}` from `$PWD` config + [`../ws-shared/tools.md`](../ws-shared/tools.md). Missing config → defaults `.agents/plans`, `.agents/codereviews`, gap `config-missing`.
   - Done when: repo root and scan roots are fixed.

2. **List candidates** — Run:
   ```bash
   node {skillsRoot}/ws-cleanup/scripts/list_disposable.cjs --repo-root {repoRoot} --plans-dir {plansDir} --reviews-dir {reviewsDir}
   ```
   Add `--scratch-only` and/or `--slug {slug}` when requested. Require exit 0 and `ok: true`.
   - Done when: JSON with `candidates`, `skipped`, `gitignoreSuggestions` is in context.

3. **Present & confirm** — Show candidate paths (kind, reason, size). `user-gate`:
   1. **Delete listed candidates** (recommended when list non-empty)
   2. **Delete subset…** (user names paths)
   3. **Cancel** — STOP, delete nothing
   Cancel / dismiss → HS-1 (never infer yes). Empty candidates → skip delete; still show gitignore suggestions.
   - Done when: approved path set is fixed (may be empty).

4. **Apply delete** — Only after explicit confirm:
   ```bash
   node {skillsRoot}/ws-cleanup/scripts/apply_cleanup.cjs --repo-root {repoRoot} --confirm --paths-file {approved.json}
   ```
   Write `{approved.json}` as a short uncommitted temp listing approved relative paths; delete the temp after. Script re-validates untracked enclosure; refuses tracked paths.
   - Done when: script exit 0 and summary of deleted/skipped printed.

5. **Gitignore suggestions** — Print `gitignoreSuggestions` where `alreadyIgnored: false`. `user-gate`: **Append suggested patterns** / **Skip**. Apply only on Append (edit root `.gitignore` or create if missing). Do not remove existing rules.
   - Done when: suggestions shown and gate resolved; skill stops.

## Rules

- Positive enclosure: delete only paths returned by `list_disposable` and re-checked by `apply_cleanup`.
- Never `git clean -fdx`, never delete `{skillsRoot}/ws-*` bodies, never delete `{sharedDir}/config.json` / MEMORY / STACK / `memory/*`.
- Active / paused workflows: scratch inside only — never the whole `{us-dir}` unless status is `completed` | `cancelled` | `failed` (or folder is `*.archive`).
- Path tokens only.
