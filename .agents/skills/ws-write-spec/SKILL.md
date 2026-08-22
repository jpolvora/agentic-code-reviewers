---
name: ws-write-spec
description: Local spec authoring & reformulation — drafts and enhances structured *.spec.md feature specifications under {specsDir} from free-text requirements or remote tracker issues.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - write-spec
  - ws-write-spec
---

# ws-write-spec

> When this skill is loaded, output "ws-write-spec loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Author or reformulate a **local** `*.spec.md` into the project specs directory only.

**Write path:** `{specsDir}/{slug}.spec.md` — resolve `{specsDir}` ← `config.json` → `plans.specsDir` (default `.agents/specs`; prefer existing repo-root `specs/` when that is the configured value). Create `{specsDir}` if missing.

**Do not** create `{plansDir}/{slug}/`, `step-00-*.spec.md`, state files, or any other plan/workflow artifact directly. Plan copies are owned by [ws-local-spec-provider](../ws-local-spec-provider/SKILL.md) `fetch-to-spec` / `--register` when a workflow starts — never by this skill’s default write.

**Format:** load [ws-spec-format](../ws-spec-format/SKILL.md) and follow it. Set `source: local` (free-text) or keep tracker origin `source: github` | `source: azure-devops`.

**Specs family:** Role = draft / reformulate under `{specsDir}` only. Router / vocabulary: [`../ws-shared/autoload.md`](../ws-shared/autoload.md). Next: format → `ws-spec-format`; start workflow → `ws-local-spec-provider` register; browse → `ws-spec-list`.

## Invocation

Standalone:

```
/write-spec "<description>" [slug=<slug>] [output-dir=<path>] [--register]
/write-spec --from-issue <path/json/text> [slug=<slug>] [source=github|azure-devops] [--register]
```

Workflow (ws-spec-to-pr / lite Step 0):
- **Free-text entry:** orchestrator runs this skill (`{specsDir}` write with `source: local`), then registers via `ws-local-spec-provider` before planning.
- **Remote tracker entry (GitHub / ADO):** orchestrator / provider runs remote fetch, then runs this skill to **reformulate and enhance** the raw issue content into an agentic-ready local spec of record `{specsDir}/{slug}.spec.md` (preserving `source: github` or `source: azure-devops` and human context), then registers via `ws-local-spec-provider` into `{us-dir}/step-00-{slug}.spec.md`.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<description>` | — | Raw feature / business text (for free-text draft) |
| `--from-issue` | — | Raw issue / work item JSON or markdown snapshot from remote provider |
| `slug` | inferred | URL-safe id (e.g. `us-{n}` for tracker items) |
| `source` | `local` | `local` for free-text, `github` for GitHub issues, `azure-devops` for ADO work items |
| `output-dir` | `{specsDir}` | Optional override for specs directory only (still writes `{output-dir}/{slug}.spec.md`; never `{plansDir}`) |
| `--register` | false | After write, register into `{us-dir}/step-00-{slug}.spec.md` via `ws-local-spec-provider` (workflow only) |

## Agentic Reformulation & Enhancement Protocol

When writing a spec derived from a remote tracker issue or raw human description, agents MUST NOT merely perform a blind verbatim copy. Instead, reformulate and enhance the specification for autonomous agentic execution while keeping human readability:

1. **Agentic Technical Scope & Objectives (`## Description`):**
   - Translate high-level human stories ("As a user, I want...") into explicit system behaviors, technical boundaries, and architecture touchpoints.
   - Clarify architectural layers, dependencies, and integration contracts.
2. **Deterministic & Testable Acceptance Criteria (`## Acceptance Criteria`):**
   - Unpack ambiguous or loose requirements into atomic, unambiguous, testable ACs (`- AC1: ...`, `- AC2: ...`).
   - Every AC must have clear pass/fail conditions suitable for agentic coding and verification.
   - Detail error handling, edge cases, input validation, and boundary conditions explicitly.
3. **Preserve Human Origin (`## Original Issue Context`):**
   - For remote tracker issues, preserve the original human-authored title, description, and discussion comments verbatim in `## Original Issue Context` so humans can trace intent back to the source issue.
4. **Frontmatter Integrity:**
   - Free-text: `source: local`, `id: null`.
   - Tracker issue: `source: github` | `source: azure-devops`, `id: {n}`, `slug: us-{n}`, `issueUrl: "{url}"`, `labels: [...]`, `workItemType: "..."` (when ADO).

## Steps

1. **Parse & Ingest** — Infer or parse title, url-safe `slug`, and origin (`source`). For tracker issues, extract metadata (`id`, `url`, `labels`, `workItemType`).
   - **Prior-work sweep (before plan/code):** When `source` is `github` or `azure-devops`, dispatch provider `sweep-prior-work` (`--issue {id}`, keywords from title/body). When `source: local` / `id: null`: keyword + `git log` on inferred paths; if `providers.scm` is github or azure-devops, also search PRs by title keywords via that provider (not via `ws-local-spec-provider`). Record findings under `## Original Issue Context` → `### Prior Work Sweep`. Exact open PR for the **same tracker id** → `user-gate` (Recommended: stop/reuse). Related hits: record and continue; `autoMode`: continue unless exact same-issue open PR (then Pause).
   - Done when: title, `slug`, `source`, metadata, and prior-work sweep (when required) are identified.

2. **Design intent (modification tasks)** — Before treating a behavior gap as a bug, inspect `git log -p -S "<symbol>"` and/or `git log -L :<func>:<file>`. Record `### Design Intent` under Notes or Original Issue Context (intentional constraint vs accidental gap). Greenfield new files: skip with reason. Mandatory for "fix bug / restore behavior" wording.
   - Done when: design-intent recorded or skip reason documented.

3. **Draft / Reformulate** — Build the enhanced spec per [ws-spec-format](../ws-spec-format/SKILL.md) and § Agentic Reformulation & Enhancement Protocol.
   - Done when: frontmatter is complete; body contains agentic `## Description`, enumerable and testable `## Acceptance Criteria`, `## Original Issue Context` (when derived from tracker issue), and `## Notes`.

4. **Write** — Save `{specsDir}/{slug}.spec.md` (or `{output-dir}/{slug}.spec.md` when overridden). Ensure parent dir exists. **Never** mkdir or write under `{plansDir}`.
   - Done when: that specsDir file exists on disk.

5. **Optional register** — Only if `--register` or the orchestrator explicitly requests a workflow plan copy. Delegate to `ws-local-spec-provider`:

   ```bash
   node {skillsRoot}/ws-local-spec-provider/scripts/register_local_spec.cjs \
     --input "{specsDir}/{slug}.spec.md" --source {source}
   ```

   That script keeps the `{specsDir}` spec of record normalized and writes `{us-dir}/step-00-{slug}.spec.md`. Use `--force` only when overwriting an existing plan copy that differs. Standalone `/write-spec` skips this step by default.
   - Done when: command succeeded, or this step was skipped.

6. **Handoff** — Return the `{specsDir}/{slug}.spec.md` path. Mention the `{us-dir}/step-00-` path only if `--register` ran. For workflow mode after register, orchestrator records `specPath` at the `step-00-` file and `specSource: {source}`.
   - Done when: caller has the specsDir path (and plan path only when registered).

## Subagent contract

- Transform the assigned source into one canonical, testable specification.
- Preserve tracker context and map each requirement to a numbered atomic AC.
- Write only the requested spec path and return its repo-relative location.
- Do not register or advance workflow state unless the caller assigns that operation.

