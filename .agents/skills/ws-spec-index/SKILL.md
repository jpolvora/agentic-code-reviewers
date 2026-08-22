---
name: ws-spec-index
description: Project PRD index manager — initializes, synchronizes, and promotes feature specifications within the project index (index.PRD).
version: 0.3.30
invocation_names:
  - spec-index
  - ws-spec-index
---

# ws-spec-index

> When this skill is loaded, output "ws-spec-index loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Manage project spec index (`index.PRD`) and linked `*.spec.md` feature specifications. Disclosed reference: [`REFERENCE.md`](REFERENCE.md), template: [`INDEX-TEMPLATE.md`](INDEX-TEMPLATE.md).

**Specs family:** Role = `index.PRD` init / status sync / promote. **Not** code↔spec body drift (`ws-sync-spec`), **not** `{plansDir}` history harvest (`ws-spec-archive`), and **not** the dual board (`ws-spec-list`). Optional stub on promote still follows [`ws-spec-format`](../ws-spec-format/SKILL.md). Router: [`../ws-shared/autoload.md`](../ws-shared/autoload.md).

## Subcommands

```text
/ws-spec-index init [sourcePath]       Bootstrap index + specsDir from README/PRD/SPECS or free text
/ws-spec-index sync [slug]             Sync shipped work to index status, checkboxes, and Done log
/ws-spec-index promote <inboxItem>     Promote an inbox idea to a phase bullet + next-specs row
```

## Modes

### 1. `init`

- Read source document (`README.md`, `PROJECT.PRD`, `SPECS.md`, or user text).
- Create `{specsDir}/` directory (`plans.specsDir`, default `.agents/specs/`).
- **Guard:** If `{specsDir}/index.PRD` already exists and is non-empty, do **not** overwrite without explicit `--force` flag. Return `skipped: "index.PRD already exists"` when `--force` is absent.
- Write `{specsDir}/index.PRD` using structure from [`INDEX-TEMPLATE.md`](INDEX-TEMPLATE.md).
- Seed phase feature lists (`- [ ]`) and next-specs table with `spec:` links.
- **Done when:** `{specsDir}/index.PRD` exists with standard sections and seed items; no invented full AC bodies.

### 2. `sync` (auto-run at delivery/ship exit)

- Check E1 evidence rule ([`REFERENCE.md`](REFERENCE.md)): requires delivery commit or PR URL signal AND matching index row / `*.spec.md` slug.
- Support consumer `index.PRD` table dialects (e.g. Next-specs headers `# | Status | Spec file` as well as `# | Spec | Status | Target Phase | Notes`).
- Match backtick `*.spec.md` filename or `slug` anywhere in Feature map bullets (`- [ ]`) and Next-specs table.
- If E1 satisfied: update status checkboxes to `[x]`, move completed rows to Done log, optionally set spec frontmatter `status: completed`.
- Never auto-write `Verified:`. Idempotent (re-applying `[x]` is safe).
- If unmapped or no evidence: return `updated: []` and `skipped: <reason>` without editing files.
- **Done when:** index / spec status updated per E1 or skipped cleanly.

### 3. `promote`

- Move item from Inbox section to relevant Feature map phase bullet (`- [ ]`) and Next specs row.
- Optional: create stub `*.spec.md` (`source: local`, `id: null`).
- **Done when:** item moved from Inbox to phase bullet + next-specs table.

## Contract summary

Inputs/outputs schema, E1 rule details, and orch call sites: [`REFERENCE.md`](REFERENCE.md).
