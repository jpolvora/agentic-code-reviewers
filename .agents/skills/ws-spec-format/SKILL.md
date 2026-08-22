---
name: ws-spec-format
description: Specification schema & validator — defines canonical *.spec.md format, section hierarchy, and acceptance criteria rules.
version: 0.3.30
invocation_names:
  - spec-format
  - ws-spec-format
---

# ws-spec-format

> When this skill is loaded, output "ws-spec-format loaded."

Create, review, or format `*.spec.md`. Canonical format SoT — other skills **reference** this skill; they do not duplicate frontmatter/sections. Schema: [`FORMAT.md`](FORMAT.md). Language: **en-us**.

**Specs family:** Role = schema + validate/reshape. Free-text draft → [`ws-write-spec`](../ws-write-spec/SKILL.md) (writes `{specsDir}`); register → [`ws-local-spec-provider`](../ws-local-spec-provider/SKILL.md). Router: [`../ws-shared/autoload.md`](../ws-shared/autoload.md).

## Modes

| Mode | When | Output |
|------|------|--------|
| **create** | Feature / tracker without local spec | New canonical `*.spec.md` |
| **review** | Gaps or format drift | Gap report + proposed fixes (edit only with approval) |
| **format** | Valid content, nonstandard shape | Reformatted file or proposed diff |

Infer mode or ask. Triggers: `/ws-spec-format`, `@ws-spec-format`, create/review/format/validate phrasing.

## Review (Done when report emitted; no edit without approval)

1. Read `*.spec.md` (or `{us-dir}/`).
2. Validate frontmatter, required sections, AC quality per [`FORMAT.md`](FORMAT.md). Tracker specs (`github` / `azure-devops`) must include `### Prior Work Sweep` when sweep ran. Modification/bugfix specs must include `### Design Intent` or documented greenfield skip.
3. Cross-check architecture docs when present (`CONTEXT.md`, stack file, `config.json.domain`).
4. Emit check table (Frontmatter / Description / ACs → OK|FAIL + fix).
5. Edit only on explicit `apply fixes` / `format`.

## Create (Done when path confirmed)

1. Collect title, description, ACs (or provider fetch).
2. Free-text local draft → [`ws-write-spec`](../ws-write-spec/SKILL.md) → `{specsDir}/{slug}.spec.md` (not `{plansDir}`).
3. GitHub issue → `ws-github-provider` `fetch-to-spec` (fetches raw issue, runs `ws-write-spec` to reformulate/enhance for agentic work while preserving original human context, then registers via `ws-local-spec-provider`).
4. ADO WI → `ws-azure-devops-provider` `fetch-to-spec` (fetches raw WI, runs `ws-write-spec` to reformulate/enhance, then registers via `ws-local-spec-provider`).
5. Existing hand-written `*.spec.md` → `ws-local-spec-provider` register/normalize (no invented tracker fields).
6. Confirm path with complete frontmatter + sections (`{specsDir}` for standalone; `{us-dir}/step-00-` after register/workflow).

## Downstream

`ws-spec-to-pr`, `ws-write-plan`, `ws-interview`, `ws-verify-plan`, `ws-testing` read **`{us-dir}/step-00-{slug}.spec.md`** only — never live tracker APIs or `*.issue.json`. See [`ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md).

Providers: [ws-github-provider](../ws-github-provider/SKILL.md) · [ws-azure-devops-provider](../ws-azure-devops-provider/SKILL.md) · [ws-local-spec-provider](../ws-local-spec-provider/SKILL.md) · [ws-write-spec](../ws-write-spec/SKILL.md). Hub: [`AGENTS.md`](../ws-shared/AGENTS.md).

