# Setup & Bootstrap — Shared Workflow Entry

Initialization, configuration bootstrap, flags, resume logic, and first-run setup.
Shared by [`ws-spec-to-pr`](../ws-spec-to-pr/SKILL.md) and [`ws-spec-to-pr-lite`](../ws-spec-to-pr-lite/SKILL.md).

Artifact paths: [`../ws-spec-to-pr/ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md). Resume rules in this file are canonical; FAQ/DIAGRAM must link here.

---

## External dependencies (guardrails)

Resolve `config.json` `rules.*` before assuming a skill or rule file exists. Full portable contract (same meaning): [`AGENTS.md`](AGENTS.md) § External dependencies in this folder · upstream root [`../../../AGENTS.md`](../../../AGENTS.md)#external-dependencies when authoring against the source repo.

| Key | Role | Resolve (first match) |
|-----|------|------------------------|
| `rules.seniorDeveloper` | Optional engineering guardrails; **Code review proof** source | config path when set (on-demand default; root `AGENTS.md` may promote autoload — see [`AGENTS.md`](AGENTS.md) § Consumer root override) → local `senior-developer` skill → global/user skill |
| `rules.karpathyGuidelines` | Surgical-change guidelines | config path → shipped `../ws-karpathy-guidelines/SKILL.md` → global skill |
| `rules.stackFile` | Human-readable stack companion | config path (default `.agents/skills/ws-shared/STACK.md`); bootstrap may create under `ws-shared/` if missing (see 1b below) — never require repo-root files |
| Other `rules.*` | Optional consumer rules (e.g. `efMigrations`, `viewPatterns`) | Use path from config when set; do not invent filenames |

**Code review proof:** When pipeline / utility skills ask for proof, load the checklist from the **resolved** `rules.seniorDeveloper` skill. Do not paste that checklist into hub docs. For autoload vs on-demand behavior, see [`AGENTS.md`](AGENTS.md) § Consumer root override.

---

## Bootstrap & Entry

> **[ws-spec-to-pr]** — Before Step 0.
> **[ws-spec-to-pr-lite]** — Before Step 0.

### Entry matrix (both orchestrators)

Same entry paths for **standard** and **lite**. Resolve provider from `config.json` `providers.active` (or legacy `issueTrackers.*.enabled` inference).

**Spec-before-plan rule (all entries):** every entry path first produces the **spec of record** `{specsDir}/{slug}.spec.md` (via `ws-write-spec` or local file normalization), then the **workflow copy** `{us-dir}/step-00-{slug}.spec.md` (via `ws-local-spec-provider` register). For remote tracker inputs, `ws-write-spec` reformulates the raw issue into an agentic-ready spec with deterministic ACs while retaining original human context. Downstream workflow skills always read `step-00-{slug}.spec.md`.

| Input | Provider / skill | Step 0 action |
|-------|------------------|---------------|
| GitHub `{n}` / `US {n}` | [`ws-github-provider`](../ws-github-provider/SKILL.md) `fetch-to-spec` | Issue snapshot → `ws-write-spec` enhancement → `{specsDir}/us-{n}.spec.md` → register `step-00` (`source: github`) |
| ADO `{org}/{project}#{id}` / `ADO {id}` / `WI {id}` | [`ws-azure-devops-provider`](../ws-azure-devops-provider/SKILL.md) `fetch-to-spec` | WI snapshot → `ws-write-spec` enhancement → `{specsDir}/us-{id}.spec.md` → register `step-00` (`source: azure-devops`) |
| Hand-written `*.spec.md` (any path) | [`ws-local-spec-provider`](../ws-local-spec-provider/SKILL.md) `fetch-to-spec` | Normalize into `{specsDir}` (in place when already there) → register `step-00` |
| Free-text feature description (no spec) | `ws-write-spec` (standard or lite) | Brainstorm → `{specsDir}/{slug}.spec.md` only, then `ws-local-spec-provider` register → `{us-dir}/step-00-{slug}.spec.md` |
| Plain text in invocation (no issue id, no `*.spec.md` path) | `ws-write-spec` | Same as free-text row |

Standalone `/write-spec` writes `{specsDir}/{slug}.spec.md` only (`plans.specsDir`, default `.agents/specs`); the workflow `step-00-{slug}.spec.md` under `{us-dir}` is created by register (or provider fetch) when a run starts. Downstream workflow skills **always** read `step-00-{slug}.spec.md` under `{us-dir}` — never `{specsDir}` and never `*.issue.json`.


1. **Config check**: Check if `.agents/skills/ws-shared/config.json` exists (fresh install normally seeds it from `config.json.example`).
   - If missing: `cp .agents/skills/ws-shared/config.json.example .agents/skills/ws-shared/config.json`.
   - Load path tokens early ([`tools.md`](tools.md) § Path tokens): `pathTokens.skillsRoot` / `sharedDir` (defaults `.agents/skills` / `.agents/skills/ws-shared`) plus `{plansDir}` ← `plans.dir`, `{specsDir}` ← `plans.specsDir`. Expand braces before Read/Grep/Shell.
   - User-gate: **Configure now (Recommended)** / **Skip**.
   - If **Configure now** (or config exists but required fields are placeholders/`<…>` / empty): load and run [`ws-configure-project`](../ws-configure-project/SKILL.md) (same session). Pass `--section` only when fixing one area mid-workflow.
   - If **Skip**: continue with example defaults; warn that providers/verification may be wrong until ws-configure-project runs.
1b. **Stack file bootstrap**: Read `config.json.rules.stackFile` (default: `.agents/skills/ws-shared/STACK.md`). Prefer ws-configure-project step 5 when that skill just ran. If config still points at a missing root `STACK.md`/`stack.md` while `.agents/skills/ws-shared/STACK.md` exists, set `rules.stackFile` to the shared path (no root file required). Else `Shell` `test -f {stackFile}`. If missing:
   - Auto-detect the project stack by scanning the repository:
     - **Language/Framework**: Look for `package.json` (Node/React/Next), `*.csproj`/`*.sln`/`*.slnx` (.NET), `pyproject.toml`/`requirements.txt` (Python), `go.mod` (Go), `Cargo.toml` (Rust), `pom.xml`/`build.gradle` (Java), `Gemfile` (Ruby), etc.
     - **Frontend framework**: Check `package.json` `dependencies` for `next`, `react`, `vue`, `angular`, `svelte`, `vite`, `tailwindcss`, etc.
     - **Backend framework**: Check for `express`, `fastify`, `nest`, `django`, `flask`, `fastapi` in matching config files.
     - **Database**: Check for `prisma/schema.prisma`, `drizzle.config.*`, `Migrations/`, `alembic/ini`, EF Core migrations, `docker-compose.yml` (PostgreSQL, MySQL, MongoDB images).
     - **Project structure**: List top-level directories (`src/`, `web/`, `tests/`, `app/`, `lib/`, `cmd/`, etc.) and infer conventional layers.
     - **Tool versions**: `node --version`, `dotnet --version`, `python --version`, `go version` (if installed).
     - **Build/test commands**: Check `package.json` `scripts` (`build`, `test`, `lint`, `dev`), `Makefile` targets, existing CI configs (`.github/workflows/`, `.gitlab-ci.yml`).
   - Generate companion from the detected information using [`STACK.md.example`](STACK.md.example) as format reference.
   - Write to `.agents/skills/ws-shared/STACK.md` (or the resolved `rules.stackFile` when it already lives under `.agents/skills/ws-shared/`). Do **not** create a repo-root stack file.
   - If auto-detection is incomplete or ambiguous (multiple possible stacks), present findings to the user and ask for clarification on uncertain items.
   - Log: `stack companion bootstrapped: {stackFile}`.
2. **Parse flags**: `auto`, `dry-run`, `skip-testing`, `skip-tests`, `skip-gates`, `full`, `strict`, `score-and-refine` (aliases: `analyze-second-pass`, `score-refine`, `scoreAndRefine`).
   - **Combined Switches:** These switches can be used individually or combined in any configuration (e.g. `full` + `auto` + `dry-run` to run a fully automated dry-run simulation of the entire workflow for testing).
   - Map: `skip-testing` → `skipTesting: true`; `skip-tests` → `skipTests: true`; `skip-gates` → `skipQualityGates: true`; `score-and-refine` / `analyze-second-pass` / `score-refine` / `scoreAndRefine` → `scoreAndRefine: true`.
   - When `skipQualityGates` is true (flag or `config.json` → `invariants.skipQualityGates`), quality gates are bypassed (classifier enforcement, fable quality visibility except `auditVerdictsBlockShip` + REFUTED, pre-advance CI, telemetry soft gates). Build, test, security, SCM, and HS-1..HS-4 still run.
   - Set `currentModel` from the **executing session model** (agent identity / runtime). If unknown → `unknown`.
   - Do **not** accept `--model` or `--model-chain` (removed). If the raw invocation still contains them, ignore and note once in the init banner: `model flags ignored — use Pause → switch model in IDE/agent host → Resume`.
   - Do **not** store or apply `modelChain`.
   - `strict` → full US verification at Step 5 (standard orch only).
2a. **Gate contract**: Load [`gates.md`](gates.md) — universal step controls, combined delivery + ship gate at standard Step 8 / lite Step 4, separate fix-PR at standard Step 9 / lite Step 5. Config/SCM: [`config-resolution.md`](config-resolution.md).
2b. **Mode hint (new workflow only):** If user did not pass density flags and invoked full `ws-spec-to-pr` without `--full`/`auto`, optionally offer once: **Full pipeline** (rec) / **Use lite instead** (`/ws-spec-to-pr-lite`) — see gates.md Mode selection. Skip when already on lite.
3. **Log parsed args and switch states**: Write a banner to step output showing all switches and their resolved values:
   ```markdown
   ### Init — Parsed args
   Raw invocation: `{raw args from user}`
   
   | Switch | Resolved |
   |--------|----------|
   | `autoMode` | `{true/false}` |
   | `dryRun` | `{true/false}` |
   | `fullMode` | `{true/false}` |
   | `scoreAndRefine` | `{true/false}` |
   | `skipTesting` | `{true/false}` |
   | `skipTests` | `{true/false}` |
   | `skipQualityGates` | `{true/false}` |
   | `currentModel` | `{session model}` |
   | `slug` | `{slug}` |
   | `workflowId` | `{workflow-id}` |
   | `branch` | `{branch}` |
   | `baseBranch` | `{baseBranch}` |
   ```
   Write this block immediately after flag parsing, before auto-resume. Applies in all modes (normal, auto, dry-run). In `dryRun`, prefix with `[DRY-RUN]`.
4. **Auto resume** or **Active Resume** (see [Resume / reset](#resume--reset)).
5. **Identity**: `workflow-id`, `slug`, `us-dir`.
   - **[ws-spec-to-pr]**: Inject `workflowType: standard` into the initialized frontmatter of `{us-dir}/{workflow-id}.state.md`.
   - **[ws-spec-to-pr-lite]**: Inject `workflowType: lite`.
5b. **Feature branch gate (new workflow only)** — runs after Identity when this is a **new** start (not resume). Resume paths skip 5b entirely (see [Resume / reset](#resume--reset) § branch resume). Do not stage or commit at bootstrap (`git add -A` forbidden).

   **Resolve `{baseBranch}`** (before the gate): read `config.json` → `project.baseBranch` when set; else `Shell` `bash {skillsRoot}/ws-ship-pr/scripts/detect-base-branch.sh`. Gate copy uses `{baseBranch}` — never treat `master` as the sole hardcoded base example.

   **Resolve `{currentBranch}`:** `git rev-parse --abbrev-ref HEAD`. Detached HEAD (`HEAD`): **stay is invalid**; require create-from-current (names a branch at HEAD) or create-from-base.

   **Protected set** (exact branch names): `main`, `master`, `develop`, `config.project.baseBranch`, `config.project.workingBranch` (omit empty/unset config values).

   **Default new branch name:** `feat/{slug}`. Before any create, check existence without trusting stale remote-tracking refs: if `git branch --list feat/{slug}` shows the branch locally, **or** `git ls-remote --heads {gitRemote} feat/{slug}` (when `{gitRemote}` is configured) prints the ref → STOP and `user-gate`:
   - **Check out existing `feat/{slug}`** (Recommended when that branch is the intended target)
   - **Enter a different branch name**
   - **Stay on `{currentBranch}`**
   - **Cancel (HS-1)**
   Never `git reset`, never `git branch -D`, never overwrite an existing feature branch. Re-run the same local + `ls-remote` check on a user-entered alternate name before any `git checkout -b {name}`. If `git ls-remote --heads {gitRemote} feat/{slug}` fails for auth/network (non-zero exit, not a missing ref), STOP and `user-gate`: **Retry** / **Proceed with local check only** / **Cancel (HS-1)**. Never infer "branch absent" from a failed `ls-remote`.

   **`autoMode`:** no `user-gate`. If `{currentBranch}` is `HEAD` (detached): do **not** stay — if `feat/{slug}` exists locally or `ls-remote` shows it, check it out (`checkout-existing`; fetch first when the name is remote-only, per the table below); else create `feat/{slug}` from HEAD (`git checkout -b feat/{slug}`). If `git ls-remote --heads {gitRemote} feat/{slug}` fails for auth/network (non-zero exit, not a missing ref), fall back to **local check only**: create `feat/{slug}` from HEAD only when `git branch --list feat/{slug}` is empty, and log `branch-gate | auto | local-check-only | {branch} | ISO`; never infer "branch absent" from a failed `ls-remote`. Never persist the literal `HEAD` as `state.branch`. Otherwise **stay** on current HEAD (no git mutation), `branchStrategy: stay`. Set `state.branch` = final branch name, `branchStrategy` = `from-current` | `checkout-existing` | `stay`, `baseBranch` = resolved value. Log in `## Gate history`: `branch-gate | auto | stay|from-current|checkout-existing|local-check-only | {branch} | ISO`.

   **`dryRun`:** prefix `[DRY-RUN]`; show the gate choices (or auto default) and the git commands that **would** run; **no ref mutation** (do not run `git checkout -b`, `git checkout`, or `git fetch`).

   **Normal mode — primary `user-gate`** (portable alias `user-gate`; native structured choice when available; markdown fallback; log `user-gate-fallback | feature-branch | ISO` when fallback used). Mark **exactly one** Recommended:
   - Option **2** when `{currentBranch}` is in the protected set.
   - Option **1** otherwise.
   Cancel / dismiss → **HS-1** (STOP, re-present; never infer yes).

   ```text
   Git branch for this workflow (HEAD: {currentBranch}; base: {baseBranch}):

   1. Create feature branch from current HEAD (Recommended when HEAD is already the intended starting point)
   2. Create feature branch from {baseBranch} (Recommended when HEAD is a protected/long-lived branch)
   3. Stay on {currentBranch} (already on the branch I want)
   ```

   When `{currentBranch}` is in the protected set, option 3 copy **must** include the AC11 warning: ship will use `{currentBranch}` as the PR head.

   | Choice | Git action | `branchStrategy` |
   |--------|------------|------------------|
   | Create from current HEAD (option 1) | `git checkout -b {name}` from HEAD. Uncommitted files come along. | `from-current` |
   | Create from `{baseBranch}` (option 2) | If `{gitRemote}` exists: `git fetch {gitRemote} {baseBranch}` then `git checkout -b {name} {gitRemote}/{baseBranch} --no-track` (`--no-track` so the new branch does not auto-track `{baseBranch}`; `@{u}` must not look like a first-push upstream). Else: `git checkout -b {name} {baseBranch}`. If fetch fails: STOP; offer retry with local `{baseBranch}` / cancel. | `from-base` |
   | Stay on current (option 3) | No checkout/create. Invalid when detached. | `stay` |
   | Check out existing `feat/{slug}` | If `git branch --list {name}` is empty but `git ls-remote --heads {gitRemote} {name}` shows the ref: `git fetch {gitRemote} {name}` then `git checkout {name}` (creates the local branch from the fetched tip). Local branch → `git checkout {name}` only. Never `reset`, never `-D`. | `checkout-existing` |

   **Dirty tree on create-from-base:** when `git status --porcelain` is non-empty and checkout from base would not be a no-op → STOP and `user-gate`:
   - **Stash then continue** — `git stash push -m "ws-spec-to-pr feature-branch-gate"`, run create-from-base, then `git stash pop` onto the new branch. Never `git reset --hard`.
   - **Switch to create-from-current instead**
   - **Cancel (HS-1)**

   **State write (mandatory before step 6):** persist in `{us-dir}/{workflow-id}.state.md` frontmatter:
   - `branch` — final branch name (created, checked-out existing, or current HEAD name for stay)
   - `branchStrategy` — `from-current` | `from-base` | `stay` | `checkout-existing`
   - `baseBranch` — resolved `{baseBranch}`

   **Banner sync:** after 5b completes, re-print the init banner `branch` / `baseBranch` rows (step 3 table) or a short **Feature branch gate result** table so displayed values match state.

6. **Baseline**: `git status --porcelain` → `preExistingDirty[]`; `git rev-parse HEAD` → `baselineCommit`.
7. **LOC baseline**: `Shell` capture → `telemetry.loc.baseline`. Store ISO → `telemetry.workflowStartedAt`.
8. **Checkpoint**: tag `uswf/{workflow-id}/before-step-0`.
9. **Progress Board** render.
10. **Step Entry Gate** → dispatch.

---

## Resume / Reset

**Auto:** skip Active Resume; use auto resume policy. If existing `active`/`paused` workflow matches same US/slug + `autoMode` + matching `workflowType`, auto-resume.

**Normal — workflow discovery (mandatory before any new workflow):**

1. `Glob` `{plansDir}/**/*.state.md` (`{plansDir}` ← `config.plans.dir`) → list all state files.
2. For each, `Read` frontmatter YAML: `status`, `workflowId`, `slug`, `us`, `currentStep`, `startedAt`, `autoMode`, `workflowType`.
3. Filter by `workflowType` match (`standard` vs `lite`).
   - **Completed Workflow Check:** If an existing workflow matches the target US/slug and has `status: completed` (or all steps finished):
     Prompt via `user-gate`:
     ```text
     Completed workflow state detected for US {us} ({slug}):
     
     Options:
     1. Run Score & Second Pass (score-and-refine) mode to analyze task scores and refine implementation (Recommended)
     2. Restart workflow from zero (overwrite/new run)
     3. View completed results & exit
     ```
     Choosing Option 1 sets `scoreAndRefine: true` and dispatches Score Analysis / 2nd Pass execution.
   - **Unfinished Workflow Check:** Filter `status: active` or `status: paused`. Present as **selectable list** via user-gate:
     ```text
     Found {N} unfinished workflow(s):
     
     1. US {us} — {slug} — Step {currentStep} — started {startedAt} — [{autoMode ? 'AUTO' : 'normal'}] (Recommended)
     2. US {us} — {slug} — Step {currentStep} — started {startedAt} — [{autoMode ? 'AUTO' : 'normal'}]
     
     Options:
     - Resume workflow #1 (Recommended)
     - Resume workflow #2
     - Start new workflow from zero
     - Cancel for now
     ```
   - **Non-Existent State:** If no matching completed or unfinished workflow exists, start fresh from **Zero** (Step 0).
4. Resume: load state, `status: active`, skip bootstrap (including **5b Feature branch gate** — do not re-run), jump to `currentStep` gate.
4b. **Branch resume (HEAD mismatch):** after skip-bootstrap, if `git rev-parse --abbrev-ref HEAD` ≠ `state.branch` → STOP. `user-gate`:
   - **Check out `{state.branch}` (Recommended)**
   - **Cancel (HS-1)**
   No silent checkout in normal mode. On checkout: `git checkout {state.branch}` only (never `reset`, never `-D`).
   **`autoMode`:** index 0 = checkout-recorded; run `git checkout {state.branch}`; log `branch-resume | auto | checkout | {branch} | ISO` in `## Gate history`.

4c. **Resume pre-check (unique commits vs integration branch — mandatory before re-implement):** After any branch checkout and before dispatching re-implementation work on a resumed workflow, mechanically verify the feature tip has **non-zero unique commits** versus the **integration branch** (not the PR-target `baseBranch` alone). Resolve `{integrationBranch}` = `config.project.workingBranch` when set and non-empty (e.g. `develop`); else `{state.baseBranch}` / `config.project.baseBranch`. When `state.branch` equals `{integrationBranch}` (stay-on-integration, e.g. working directly on `develop`), the rev-list gate cannot distinguish an already-merged tip from the live integration tip — skip the count, log `resume-gate | skip-check | stay-on-integration | {branch} vs {integrationBranch} | ISO` in `## Gate history`, and proceed with the normal resume (do **not** mark completed). If `{gitRemote}` exists, run `git fetch {gitRemote} {integrationBranch}` (same refresh as §5b) before the count. On auth/network failure, do not infer — skip-check (log `resume-gate | skip-check | fetch-failed | {branch} vs {integrationBranch} | ISO`) and proceed; never mark completed on an unverifiable count. Then run `git rev-list --count origin/{integrationBranch}..HEAD`. Comparing only to `origin/{state.baseBranch}` (e.g. `main`) is wrong when work lands on `develop` first: the tip can still be ahead of `main` while already merged into `develop`, so the gate would never fire (stale-orch-resume trap). If the count is **NOT > 0** (i.e. the count is `0`), treat as **already merged** **only when** the workflow has produced product commits: `state.commits` is non-empty **or** `completedSteps` includes the first required G2-code step (Step 5 standard / Step 2 lite) **and** `git rev-parse HEAD` ≠ `state.baselineCommit`. In that case do **not** re-implement or create/update a PR; **mark the leftover workflow `completed`** in state (already merged), restore HEAD to `{integrationBranch}` (`git checkout {integrationBranch}` only — never `reset`, never `-D`), log `resume-gate | stale | 0-unique-commits | {branch} vs {integrationBranch} | ISO` in `## Gate history`, and stop so the user starts new work from the integration branch. If the count is `0` but the workflow should proceed ((empty `state.commits` **and** no G2-code step in `completedSteps`) **or** `git rev-parse HEAD` equals `baselineCommit`), this is normal pre-first-commit resume — proceed with the normal resume re-implementation (do **not** mark completed). If the count is `>= 1`, proceed with the normal resume re-implementation. When `origin/{integrationBranch}` is unavailable (not fetched / git-less dry-run), log `resume-gate | skip-check | {branch} | ISO` and continue (dry-run/git-less never blocks resume).

5a. **Session model refresh (mandatory on every resume):** Re-read the executing session model → update `currentModel`. If changed vs prior frontmatter value, log `model-change | step {currentStep} | {old} → {new} | ISO` in ## Gate history. Ignore leftover `modelChain` keys in old state files.
6. Paused: resume at same step (checkpoint revert M=currentStep → hygiene → board → gate).
7. No unfinished workflows: skip list, proceed to bootstrap.

**Full reset:** Checkpoint Revert M=1 → gate **Start again** (new workflow-id) / **Exit**.

**Stale state cleanup** (new workflow start or explicit):
- Starting new while old exist → offer: **Archive old workflows** (move to `{workflow-id}.archive/`) / **Delete** / **Keep both**.
- Stale = `status: active|paused` and `startedAt` older than 7 days → flag `[STALE]`.
