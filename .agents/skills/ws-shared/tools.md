# Tools — Standard Agent Vocabulary

Canonical tool names every agent uses. Project-specific parameters from `config.json`. Do not hardcode build/test commands in skills — use these aliases.

## Path tokens (load first)

**Before** any `Read` / `Grep` / `Glob` / `Shell` that uses a brace path, expand tokens from this table (same idea as `{plansDir}` ← `plans.dir`). Prefer `config.json` → `pathTokens.*` when present; otherwise use the **Default** column.

| Token | Resolve | Default (install contract) |
|-------|---------|----------------------------|
| `{skillsRoot}` | `pathTokens.skillsRoot` | `.agents/skills` |
| `{sharedDir}` | `pathTokens.sharedDir` | `{skillsRoot}/ws-shared` → `.agents/skills/ws-shared` |
| `{plansDir}` | `plans.dir` | `.agents/plans` |
| `{specsDir}` | `plans.specsDir` | `.agents/specs` |
| `{reviewsDir}` | `reviews.dir` | `.agents/codereviews` |
| `{us-dir}` | `{plansDir}/{slug}/` | (slug from workflow) |
| `{globalSkillsRoot}` | `WORKFLOW_SKILLS_GLOBAL_DIR` (if set) | `~/.agents/skills` |

**Agent contract:**

1. Load `config.json` (`read-config`) then this file (`toolsFile`, default `tools.md`) early in the session.
2. Expand tokens **before** tool calls. Example: `{sharedDir}/MEMORY.md` → `.agents/skills/ws-shared/MEMORY.md`.
3. **Forbidden:** bare `ws-shared/MEMORY.md` or other undeclared shorthands (do not Grep those literals).
4. **Shell recipes:** expand tokens before paste, or write the Default path literally (copy-paste safe).
5. **Markdown links** in skill files: use real relative paths (`../ws-shared/…`), never brace tokens (GitHub/ws-check-harness cannot expand them).
6. **Hub routing tables** that inventory disk paths: keep full `.agents/skills/…` literals so audits stay filesystem-true.
7. `{skillsRoot}` / `{sharedDir}` are **fixed install layout**, not relocatable consumer knobs (unlike `plans.dir` / `plans.specsDir` / `reviews.dir`).
8. Spec skills: standalone drafts under `{specsDir}`; workflow copy under `{us-dir}/step-00-*.spec.md` after register/provider. Specs intent without a named skill → load [`autoload.md`](autoload.md) § Specs skill router first (progressive disclosure).
9. Consumer root autoload: `ws-configure-project --section autoload` (helper `configure_autoload.py`) may emit `.agents/skills/...` or `{globalSkillsRoot}/...` into `autoload.md` / root `AGENTS.md` — never absolute filesystem paths. Harness Phase 2 validates Always-applied path forms when `autoload.md` is present.
10. **Skill-script path expand (hybrid):** for managed script recipes, resolve `{skillsRoot}/ws-<id>/scripts/...` when that path exists under the consumer project; otherwise `{globalSkillsRoot}/ws-<id>/scripts/...` (same local-first rule as `configure_autoload.py` `emit_skill_path`). Runtime consumer data (`config.json`, `MEMORY.md`, `STACK.md`) always comes from `$PWD/{sharedDir}` — never from `../ws-shared/` relative links inside a globally installed `SKILL.md` (those point at the global hub on disk).

## Core tools

| Tool | Action | Native | Source from config |
|------|--------|--------|--------------------|
| `build-backend` | Compile backend | `Shell` | `verification.backendBuild` |
| `test-backend` | Run backend tests | `Shell` | `verification.backendTest` |
| `lint-backend` | Check code style | `Shell` | `verification.backendFormat` |
| `build-frontend` | Compile frontend | `Shell` | `verification.frontendBuild` |
| `test-frontend` | Run frontend tests | `Shell` | `verification.frontendTest` |
| `build-all` | Build both stacks | `Shell` | chain `backendBuild` + `frontendBuild` |
| `migrations-add` | Add EF migration | `Shell` | `verification.migrationsAdd` |
| `migrations-apply` | Apply EF migrations | `Shell` | `verification.migrationsApply` |
| `seed-db` | Seed demo data | `Shell` | `database.seedScript` |
| `start-stack` | Start full stack | `Shell` | `orchestration.startCommand` |
| `stop-stack` | Stop API + Vite | `Shell` | `orchestration.stopCommand` |
| `compose-up` | Docker full stack | `Shell` | `orchestration.composeCommand` |

## State & workflow tools

Path tokens: [Path tokens (load first)](#path-tokens-load-first). Artifact names: [`ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md).

| Tool | Action | Native |
|------|--------|--------|
| `read-state` | Read workflow state | `Read` `{us-dir}/{workflow-id}.state.md` |
| `write-state` | Write/append state | `Write` / `StrReplace` (hygiene before board) |
| `read-config` | Load project config | `Read` `{sharedDir}/config.json` |
| `read-artifacts-registry` | Resolve one artifact from the Artifact map | `Read` `{skillsRoot}/ws-spec-to-pr/ARTIFACTS.md` heading `## Artifact map` for the named row/anchor only. Do not read ARTIFACTS.md in full. |
| `read-stack` | Load stack reference | `Read` `config.json.rules.stackFile` (default `{sharedDir}/STACK.md`) |
| `read-memory` | Load learned knowledge **before** plan/code/fix | `Grep` / `Read` `{sharedDir}/MEMORY.md` (keywords from the task). Mandatory for mutating work — see [`ws-self-learning`](../ws-self-learning/SKILL.md) § Pre-work consult |
| `search-code` | Find patterns in code | `Grep` / `Glob` |
| `run-script` | Run workflow / provider script | `Shell` with **explicit launcher** (see [Script launchers](#script-launchers)): `python` / `node` / `bash` + path. Orchestrator helpers: `node {skillsRoot}/ws-spec-to-pr/scripts/{name}.cjs` (`update_state`, `validate_state`). Frozen Python helpers remain for converters/thread shims: prefer `{skillsRoot}/{github,azure-devops,local-spec}-provider/scripts/` |

## Source control tools

| Tool | Action | Native |
|------|--------|--------|
| `commit-code` | Commit workflow product files from `files_touched` | Path-scoped `Shell`: `HEAD` must equal `state.branch`; `git add -- <paths>` and `git add -u -- <deleted-paths>` from workflow `files_touched` (drop `{plansDir}/**`, secrets, gitignored, `preExistingDirty`). Never `git add -A`, `git add .`, or directory-wide `src/` `web/` `tests/`. Empty `git diff --cached` → skip (no empty commit). Then `git commit -m "..."` |
| `commit-delivery` | Commit configured delivery artifacts (Step 8) | Resolve stage list from `defaults.deliveryCommitArtifacts` per [`ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md) § Step 8; `Shell` `git add` only resolved `{us-dir}` paths then `git commit` (message may say “configured delivery artifacts”) |
| `push-branch` | Push working branch | `Shell` `git push {gitRemote} {workingBranch}` — from `config.project` |
| `create-pr` | Create PR via SCM provider | Resolve `providers.scm` → [`ws-github-provider`](../ws-github-provider/SKILL.md) or [`ws-azure-devops-provider`](../ws-azure-devops-provider/SKILL.md) `create-pr` (not raw `gh`/`az` alone) |
| `sweep-prior-work` | Search PRs + recent commits before plan/code | Same SCM provider as `create-pr` |
| `check-pr-status` | CI/policy status + failed-log triage | Same SCM provider (`diff-regression` / `baseline` / `infra-flake`; one flake rerun) |
| `comment-issue` | Post tracker comment (alias `close-loop`) | Same SCM provider; skip when tracker `id` is null |
| `list-threads` / `resolve-thread` / `merge-pr` | PR review + merge intents | Same SCM provider skill as `create-pr` |
| `create-checkpoint` | Tag before step N | `Shell` `git tag uswf/{id}/before-step-{N}` |
| `revert-to-checkpoint` | Revert to tag M | `Shell` `git reset --mixed {tag}` + per-path restore |

Entry / fetch: resolve `providers.active` → [`ws-github-provider`](../ws-github-provider/SKILL.md) · [`ws-azure-devops-provider`](../ws-azure-devops-provider/SKILL.md) · [`ws-local-spec-provider`](../ws-local-spec-provider/SKILL.md) `fetch-to-spec` (remote fetch → [`ws-write-spec`](../ws-write-spec/SKILL.md) agentic reformulation → local-spec register). Consumers who already installed `ws-spec-to-pr` before these folders existed: `npx github:jpolvora/workflow-skills update --include-new`.


## Agent dispatch tools

| Tool | Action | Native |
|------|--------|--------|
| `dispatch-agent` | Spawn subagent for step | Subagent dispatch (host-provided); prefer `subagent_type: generalPurpose\|shell`; `description: "STP step {N} — {Label}"` |
| `dispatch-parallel` | Spawn ≤3 concurrent DAG tasks | Subagent dispatch (host-provided) — same worktree, no file overlap |
| `user-gate` | Ask question | Host structured-choice UI when available; ≥2 options, recommended first; cancelled → HS-1. Markdown fallback when unavailable (see [`gates.md`](gates.md)); log `user-gate-fallback` |
| `user-gate-auto` | Auto-select first option | auto-gate table — no user-gate prompt |
| `browser-mcp` | Browser integration test | Host browser MCP when available (only normal mode, non-dry-run, gated) |

### Subagent model preferences

The orchestrator session ALWAYS runs under the active session model (`currentModel`). Model preferences in `config.json` → `defaults` (`plannerModel`, `executionModel`, `reviewerModel`, `testingModel`) apply EXCLUSIVELY to subagents spawned via `dispatch-agent` in the **standard** orchestrator:
- **Planning Phase**: `defaults.plannerModel` (standard Steps 0–3)
- **Execution Phase**: `defaults.executionModel` (standard Step 4)
- **Review Phase**: `defaults.reviewerModel` (standard Steps 5–6)
- **Testing Phase (standard Step 7 only)**: non-empty `defaults.testingModel`, else `defaults.executionModel`, else the active session model. Lite does not read or apply `testingModel`.

**Lite (`ws-spec-to-pr-lite`):** executes inline in the main orchestrator session with no `dispatch-agent` subagents, so phase model preferences do not apply. The session stays under `{currentModel}`. Resolve them only for telemetry recording, never to switch the session model.

**Portable parameterization:** when `dispatch-agent` exposes a model field, pass the configured identifier through that field. Otherwise include `Model: {modelName}` in the dispatch header when the host supports model hints.

**Non-blocking fallback:** if a configured model string is empty, rejected, or unsupported by the session host, the orchestrator and subagent continue under the active session model without interrupting workflow execution.

## Knowledge tools

| Tool | Action | Native |
|------|--------|--------|
| `update-memory` | Write learned pattern | Create unique file in `{sharedDir}/memory/` and run `node {skillsRoot}/ws-self-learning/scripts/self_learning.cjs --compile` |
| `update-ws-changelog` | Append historical log | `Write`/`StrReplace` `config.json.rules.changelogFile` (default `{sharedDir}/CHANGELOG.md`) |

## Script launchers

Managed skill scripts are upstream-owned. Invoke with an **explicit launcher**; never rely on shebang alone or the host default shell.

| Extension | Launcher | Example |
|-----------|----------|---------|
| `*.py` | `python` | `python {skillsRoot}/.../scripts/foo.py` (expand token first) |
| `*.cjs` / `*.js` | `node` | `node {skillsRoot}/.../scripts/foo.cjs` (expand token first) |
| `*.sh` | `bash` | `bash {skillsRoot}/.../scripts/foo.sh` (expand token first) |

**Contract (agents):**

1. Prefix every recipe/script call with the launcher above (`python …`, `node …`, `bash …`).
2. Do **not** rewrite managed scripts for shell quirks (no pwsh/cmd translations, no in-place dialect patches).
3. Do **not** invent temp scanners/bridges when a recipe fails — report the failure (missing launcher, non-zero exit) and stop; lasting fixes go upstream.
4. Consumer `verification.*` (and other config command strings): run **unchanged**. If they assume `pwsh` and the host is bash (or the reverse), that is a **consumer config** problem, not a skill-script problem.

Skill `.sh` dialect: Git Bash–compatible bash. Prefer Node/Python for new logic; keep shell as thin glue.

## Rules

1. **No hardcoded commands** in skills — use tool aliases. Config.json holds project-specific values.
2. **Shell only for git/build/scripts** — never use bash where `Read`/`Write`/`Grep`/`Glob` suffice.
3. **Explicit launchers** — every managed script call uses `python` / `node` / `bash` per [Script launchers](#script-launchers).
4. **Consult MEMORY before mutating** — `read-memory` (`Grep` / `Read` `{sharedDir}/MEMORY.md`) before plan, code, skill edits, or script fixes; apply known Solutions. Write new traps via `update-memory` after.
5. **One worktree max** — step 4 worktrees are exclusive under `{worktrees-dir}` when `config.plans.useWorktrees` is true.
6. **No commit of `{plansDir}/`** — except Step 8 delivery per [`ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md).
7. **Subagents: fresh per step** — never resume a subagent across steps.
8. **Orch never edits code** — hard stop. Code changes spawn via `dispatch-agent`.
9. **Paths via tokens** — expand [Path tokens](#path-tokens-load-first) before tool calls; never invent undeclared shorthands. `{plansDir}` / `{reviewsDir}` / `workingBranch` / `baseBranch` come from config; `{skillsRoot}` / `{sharedDir}` from `pathTokens` or defaults.
