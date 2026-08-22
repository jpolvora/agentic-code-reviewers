---
name: ws-spec-list
version: 0.3.30
description: Dual board for specs vs plan workflows plus manage menu. Trigger when listing, picking, or managing specs/plans.
disable-model-invocation: true
invocation_names:
  - spec-list
  - ws-spec-list
---

# ws-spec-list

> When this skill is loaded, output "ws-spec-list loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Interactive **two-board + menu** for the current project. **Specs ≠ plans** — never merge them into one inventory.

| Kind | Root | What it is |
|------|------|------------|
| **Spec** | `{specsDir}` ← `plans.specsDir` (default `.agents/specs`) | Human-facing `*.spec.md` (and optional `index.PRD`) |
| **Plan** | `{plansDir}` ← `plans.dir` (default `.agents/plans`) | Workflow run under `{us-dir}/` — `*.state.md`, step artifacts, canonical `step-00-*.spec.md` copy |

Canonical `step-00-*.spec.md` under `{plansDir}` is a **plan artifact**, not a Spec-board row. Not `ws-spec-index` / `ws-spec-archive` (those own `index.PRD` content). Action details: [`ACTIONS.md`](ACTIONS.md).

**Specs family:** Role = dual board + manage menu (Specs ≠ Plans). Start/Continue hands off to orch; does not rewrite AC bodies (`ws-sync-spec`) or `index.PRD` (`ws-spec-index`). Router: [`../ws-shared/autoload.md`](../ws-shared/autoload.md).

## Invocation

```text
/ws-spec-list
/ws-spec-list --specs
/ws-spec-list --plans
/ws-spec-list --active
/ws-spec-list --status active|completed|cancelled|failed
/ws-spec-list --unlinked
```

| Flag | Effect |
|------|--------|
| (none) | Show **both** boards |
| `--specs` | Spec board only |
| `--plans` | Plan board only |
| `--active` | Plan board filtered to `status: active` (implies plans focus) |
| `--status X` | Plan board filtered to that status |
| `--unlinked` | Specs with no matching plan slug **and** plans with no matching `{specsDir}` spec |

## Steps

1. **Resolve** — Read `{sharedDir}/config.json`. Expand `{plansDir}` ← `plans.dir`, `{specsDir}` ← `plans.specsDir`. Load [`../ws-shared/tools.md`](../ws-shared/tools.md) Path tokens + [`../ws-shared/gates.md`](../ws-shared/gates.md) for `user-gate`.
   - Done when: both roots resolved (missing config → stop and point to `ws-configure-project`).

2. **Discover (keep sets separate)** — Agent scan (no helper script):
   - **Specs:** Glob `{specsDir}/**/*.spec.md` only. Slug from frontmatter `slug:` or filename stem. Do **not** add `{plansDir}/**/step-00-*.spec.md` to the Spec set.
   - **Plans:** Glob `{plansDir}/**/*.state.md` (include `*.archive/` paths; mark `archived: true`). Parse frontmatter: `workflowId`, `us`/`slug`, `status`, `workflowType`, `currentStep`, `completedSteps`, `prUrl`/`prNumber`, `specPath` when present (ACTIONS § Fields).
   - **Link by slug:** same slug in both sets → Spec shows linked plan status; Plan shows `Spec: yes|no` / path under `{specsDir}` when found.
   - Done when: two row sets built (either may be empty).

3. **Board** — Print **two** markdown tables when both kinds are in scope (ACTIONS § Boards). Global `#` index across both tables for Select. Sort Specs: unlinked → linked (alpha). Sort Plans: `active` → `failed` → `cancelled` → `completed`; archived last within status. Cap display at 25 rows total; note “N more — filter with `--specs` / `--plans` / `--status`”.
   - Done when: requested board(s) shown with `#` per row.

4. **Select** — `user-gate`: pick a row by `#` / slug, or **Exit**, or **Refresh**. Prefer host structured choice; markdown fallback when unavailable. Label options with kind: `S# slug (spec)` / `P# slug (plan)`.
   - Done when: one row chosen or session ended.

5. **Act** — Second `user-gate` with actions valid for that **kind** (ACTIONS § Matrix). Execute exactly one action; confirm before Finish / Cancel / Archive / Remove.
   - Done when: action applied (or cancelled at confirm → re-present Act menu).

6. **Loop** — Unless Exit: Refresh board (step 3) → Select. After Continue / Start: hand off to orch and **stop** this skill (orch owns the session).
   - Done when: user Exit, or orch handoff complete.

## Rules

- en-us; harness-neutral; path tokens only — never hardcode `{specsDir}` / `{plansDir}`.
- Never label a plan row as a spec or a spec row as a plan.
- Do not invent rows or PR URLs; missing field → `—`.
- Destructive actions require explicit confirm (HS-1 on dismiss).
- Continue / Start load orch — do not re-implement pipeline steps here.
- Remove on **spec** deletes only the `{specsDir}` file (or ask); Remove on **plan** deletes `{us-dir}/` — never `{sharedDir}`, never cross-delete the other kind unless the user confirms both.
