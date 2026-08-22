# ACTIONS — ws-spec-list

Disclosed reference for [`SKILL.md`](SKILL.md).

**Specs ≠ plans.** Specs live under `{specsDir}`. Plans (workflow runs) live under `{plansDir}`. Canonical `step-00-*.spec.md` under `{us-dir}` is a plan artifact — do not list it on the Spec board.

## Kind

| Kind | Source | Primary identity |
|------|--------|------------------|
| **spec** | `{specsDir}/**/*.spec.md` | Spec path + `slug` |
| **plan** | `{plansDir}/**/*.state.md` | State path + `slug` / `us` / `{us-dir}` |

## Plan fields (from `*.state.md` frontmatter)

| Field | Board column | Notes |
|-------|--------------|-------|
| `us` / `slug` | Slug | Prefer `slug`, else `us`, else parent folder name |
| `status` | Status | `active` \| `completed` \| `cancelled` \| `failed` |
| `workflowType` | Type | `standard` \| `lite` (unknown → `—`) |
| `currentStep` | Step | Integer; show as `N/max` |
| `completedSteps` | Done% | `round(100 * len / max)`; max = 10 standard (0–9), 6 lite (0–5) |
| `prUrl` / `prNumber` | Delivery | URL if present; else `#N`; else `step-08-*.result.md` → `result`; else `—` |
| path contains `.archive` | Loc | `archive` vs `live` |
| matching `{specsDir}` file | Spec | `yes` (+ short path) or `no` |

## Spec fields (from `*.spec.md`)

| Field | Board column | Notes |
|-------|--------------|-------|
| `slug` / filename | Slug | Prefer frontmatter `slug:`, else file stem |
| `title` | Title | Frontmatter or first `#` heading; truncate long |
| `status` (optional) | Status | Frontmatter when present; else `—` |
| matching plan state | Plan | `active` / `failed` / `completed` / … or `none` |
| path under `{specsDir}` | Path | Repo-relative |

## Boards

Print separately. Use one global `#` sequence across both (or prefix labels `S` / `P` in the Select gate).

```markdown
## Specs ({specsDir})

| # | Slug | Title | Status | Plan | Path |
|---|------|-------|--------|------|------|
| 1 | new-feature | New feature | draft | none | {specsDir}/new-feature.spec.md |
| 2 | us-101 | Issue 101 | — | active | {specsDir}/us-101.spec.md |

## Plans ({plansDir})

| # | Slug | Status | Type | Step | Done% | Delivery | Spec | Loc |
|---|------|--------|------|------|-------|----------|------|-----|
| 3 | us-101 | active | standard | 4/10 | 40% | — | yes | live |
| 4 | auto-mode-… | completed | lite | 6/6 | 100% | #42 | no | live |
```

Footer: `N specs · M plans · filter: {all|--specs|--plans|--active|--status X|--unlinked} · /ws-spec-list`

Empty set: print the section header and `_(none)_` — do not invent rows.

## Action matrix

### Spec rows

| Action | When offered | Effect |
|--------|--------------|--------|
| **Start** | always (unless a live `active`/`failed` plan already exists for slug — then prefer **Continue** on that plan row) | Start orch on this `{specsDir}` path (classify if needed); hand off; stop |
| **Open** | always | Print full path + title; read-only |
| **Remove** | always | Confirm (type slug) → delete **only** this `{specsDir}` file; do **not** delete `{us-dir}` unless user separately confirms a plan Remove |
| **Back** | always | Return to Select |
| **Exit** | always | Stop skill |

### Plan rows

| Action | When offered | Effect |
|--------|--------------|--------|
| **Continue** | `active` or `failed` (live state) | Load orch matching `workflowType` (`ws-spec-to-pr` / `ws-spec-to-pr-lite`) with state path; hand off; stop list skill |
| **Start** | no live state for slug, or user wants a fresh run | Start orch (prefer linked `{specsDir}` path when Spec=`yes`; else `{us-dir}/step-00-*.spec.md` if present); hand off; stop |
| **Finish** | `active` or `failed` | Confirm → set `status: completed`, `endedAt: ISO`; do **not** invent PR |
| **Cancel** | `active` or `failed` | Confirm → set `status: cancelled`, `endedAt: ISO` |
| **Archive** | live row with terminal or stale state (`completed`/`cancelled`/`failed`, or user insists on active) | Confirm → move `{workflow-id}.state.md` (and sibling stale copies per ARTIFACTS) into `{us-dir}/{workflow-id}.archive/` |
| **Remove** | any plan row | Confirm (type slug) → delete `{us-dir}/` only; never delete `{sharedDir}`; never delete `{specsDir}` files unless user also confirmed a spec Remove |
| **Open PR** | Delivery has URL or `#N` | Print URL / `gh pr view` via SCM provider if configured; read-only |
| **Back** | always | Return to Select |
| **Exit** | always | Stop skill |

### Confirm gates

Finish / Cancel / Archive / Remove: `user-gate` with **Confirm (Recommended)** / **Back**. Remove second line: must match slug string before delete. State which kind will be deleted (`spec file` vs `plan folder`).

### Orch handoff

```text
Continue (plan) → Read state → load {skillsRoot}/ws-spec-to-pr[/lite]/SKILL.md → resume at currentStep
Start (spec)    → load orch entry with {specsDir} path (or ws-write-spec when no body yet)
Start (plan)    → load orch; prefer linked {specsDir} path over inventing a new spec
```

Do not edit application code or run pipeline steps inside this skill.
