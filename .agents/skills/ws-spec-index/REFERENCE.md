# ws-spec-index Reference

Reference details, evidence rules, path tokens, and call contracts for `ws-spec-index`.

## Path Tokens

| Token | Default | Source |
|-------|---------|--------|
| `{specsDir}` | `.agents/specs/` | `config.json` → `plans.specsDir` |
| `{plansDir}` | `.agents/plans/` | `config.json` → `plans.dir` |

## Status Legend

| Mark | Meaning | Notes |
|------|---------|-------|
| `[ ]` | todo | Initial state for planned items |
| `[~]` | partial | In-progress work |
| `[x]` | done | Completed and delivered |
| `Verified: ...` | optional host smoke | **Never auto-written by sync**; human / host verification only |

## Evidence Rule E1

Mark `[x]` or update spec `status` only when **both** conditions hold:

1. **Ship-success signal** (either is sufficient; merge is **not** required):
   - Local delivery commit recorded in `step-08-{slug}.result.md` / ship gate, **or**
   - `shipAction: create-pr` with PR URL captured.
2. **Mapping** to a known index row or `*.spec.md` slug.

If no mapping exists: return `updated: []` and `skipped: "No matching index row for slug"`. Do **not** edit files.

## Minimum Index Contract & Accepted Dialects

Consumer repositories may evolve their `index.PRD` layout. `ws-spec-index` operations must respect living documents and accept common Markdown table/list variations:

| Area | Accepted Dialects / Variations | Machine Match Strategy |
|------|--------------------------------|------------------------|
| **Next specs table** | Template: `# \| Spec \| Status \| Target Phase \| Notes`<br/>Live: `# \| Status \| Spec file \| Scope` (or any table with Status + Spec/file) | Locate backtick `*.spec.md` or slug in table row; update status column cell (`[ ]` → `[x]`). |
| **Done log table** | Template: `Date \| Slug \| Title \| PR / Commit`<br/>Live: `When \| Item \| Notes` (or Date/When + Item/Slug) | Append completed row using available column layout. |
| **Archive table** | Template: `Slug \| Outcome \| Last state \| PR / Commit \| Summary` under `## Archive` or `## N. Delivery archive` | Owned by `ws-spec-archive`. `sync` must preserve existing Archive rows; do not delete the section. |
| **Feature map** | Bullet lists `- [ ] Feature (\`spec: ...\`)` or nested bullets with separate `- **spec:** \`...\`` | Match backtick `*.spec.md` or slug; update checkbox `[ ]` → `[x]`. |
| **Dual-path specs** | Normal after any run starts: `{specsDir}/{slug}.spec.md` (spec of record) plus `{plansDir}/{slug}/step-00-*.spec.md` (workflow copy) | `{specsDir}/{slug}.spec.md` path is primary for index status updates. |
| **`init` Guard** | Non-empty `{specsDir}/index.PRD` exists | Refuse to overwrite without explicit `--force` flag. Return `skipped: "index.PRD already exists"`. |
| **Spec Frontmatter** | Frontmatter may have `status: draft|completed` or no `status` field | Index row + disk slug mapping is primary; spec frontmatter update is optional. |

## Orchestrator Call Contract

```yaml
input:
  mode: sync | init | promote
  slug: string?                 # workflow slug when known
  shipEvidence:                 # sync only
    deliveryCommit: boolean?
    prUrl: string?
    resultPath: string?         # step-08-*.result.md when present
  specsDir: string?             # override; else config plans.specsDir
  indexFile: string?            # default index.PRD
  sourcePath: string?           # init: README/PRD/SPECS path or free text
  inboxItem: string?            # promote

output:
  updated: string[]             # paths or row ids touched
  skipped: string?              # reason when no-op
```

## Call Sites Wired in `workflow-skills`

1. `ws-spec-to-pr` Step 8: Call `sync` after successful delivery commit and/or create-PR ship action.
2. `ws-spec-to-pr-lite` Step 4: Call `sync` on ship path with delivery evidence.
3. `ws-ship-pr`: Call `sync` after successful ship action.

## Out of Scope (v1)

- IDE/agent session stop / after-agent hooks
- Deterministic Python/Node index rewrite scripts
- Coupling to Kanban board / `/board` data plane
- Auto-writing `Verified:`
