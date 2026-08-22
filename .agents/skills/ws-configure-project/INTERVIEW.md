# ws-configure-project — Interview reference

Disclosed detail for [`SKILL.md`](SKILL.md). Load when detecting or interviewing sections.

## Required (must resolve before workflows)

| Section | Keys | Notes |
|---------|------|-------|
| `project` | `name`, `baseBranch` | `workingBranch` default `develop`; `gitRemote` default `origin`; `repoUrl` / `org` strongly recommended |
| `providers` | `active`, `scm` | Or legacy `issueTrackers.*.enabled` inference — prefer explicit `providers` |
| `verification` | at least one build or test command used by the stack | Empty strings OK only if that stack side is absent |
| `plans` | `dir` | Default `.agents/plans` |

## Optional (offer once, skippable)

`stack`, `domain`, `fable`, `reviews`, `rules` (non-empty paths only), `defaults`, `dagThresholds`, `issueTrackers` details, `orchestration` / DB fields under `stack`, **`autoload`** (persists `defaults.autoload` + Always-applied path refresh; optional root `AGENTS.md` when enabled).

## Detection heuristics

Scan consumer **repo root** (not this skill package alone):

| Signal | Suggest |
|--------|---------|
| `package.json` | Node stack; read `scripts.build` / `test` / `lint` / `dev` → `verification.*` / `orchestration.*` |
| `*.sln` / `*.slnx` / `*.csproj` | .NET; `dotnet build` / `dotnet test` |
| `pyproject.toml` / `requirements.txt` | Python; pytest/uvicorn hints when present |
| `go.mod` / `Cargo.toml` | Go / Rust verification commands |
| `.git` + `git remote get-url origin` | `project.repoUrl`, `org`, host → `providers.scm` (`github.com` → github; `dev.azure.com` / `visualstudio.com` → azure-devops) |
| `gh` auth / GitHub remote | `providers.active=github`, enable `issueTrackers.github` |
| ADO remote only | `providers.active=azure-devops` |
| No tracker remote / `specs/**/*.spec.md` | Suggest `active=local` + set `scm` from remote host or ask |
| No app stack detected + `.agents/skills/` present | Suggest `verification.backendTest: "python .agents/skills/ws-check-workflows/scripts/check_workflows.py"` for harness validation |
| `prisma/` / `drizzle` / `Migrations/` / compose DB services | `stack.database.*` hints |
| Top-level `src/`, `web/`, `tests/` | `stack.backend.srcDir` / frontend `sourceDir` / test paths |
| `.agents/skills/ws-shared/STACK.md` (preferred) | `rules.stackFile` → that path |
| Root `STACK.md` / `stack.md` (legacy optional) | Keep only if user already uses it; do not create or require |
| `.agents/skills/ws-shared/CHANGELOG.md` (preferred) | `rules.changelogFile` → that path |
| Repo-root `CHANGELOG.md` | Only if user sets `rules.changelogFile: "CHANGELOG.md"` |
| Existing repo-root `specs/` | Keep `plans.specsDir: "specs"` |
| No specs dir yet | Suggest `plans.specsDir: ".agents/specs"` |
| Fable skills in `{skillsRoot}` | Suggest `fable.enabled: true` (**Recommended**), `autoAudit: true`, `autoDetectDomain: true`, `auditVerdictsBlockShip: "refuted"` |
| Session host exposes subagent model identifiers | Offer those portable identifiers for `defaults.plannerModel`, `defaults.executionModel`, `defaults.reviewerModel`, and `defaults.testingModel`; otherwise recommend empty values and active-session fallback |
| Existing `config.json` placeholders `<…>` | Treat as gaps |

## Interview order

1. `project` (name, org, repoUrl, baseBranch, workingBranch)
2. `providers` + matching `issueTrackers` slice
3. `plans.dir` / `plans.specsDir` / optional `reviews.dir`
4. `verification` (+ `orchestration` if detected). Also offer optional **mutation gate** keys when the stack has unit tests: `verification.mutationTest` (runner command; empty = skip), `verification.mutationThreshold` (default 80).
5. `stack` summary (id, description, key paths) — or defer to STACK.md generation
6. `fable` (Enable/disable Fable skills integration; autoAudit, autoDetectDomain, auditVerdictsBlockShip)
7. `defaults` — optional (autoMode, dryRun, skipTesting, **skipMutationTesting**, scoreAndRefine, **patternsBackend**, **patternsFrontend**, `contextBudget`, `parallelVerifyReview`, `gateGranularity`, and `convergence`) + **Delivery commit artifacts** (`defaults.deliveryCommitArtifacts`) + portable subagent model preferences:
   - `plannerModel` (Planning phase: Steps 0–3)
   - `executionModel` (Execution phase: Step 4)
   - `reviewerModel` (Review phase: standard Steps 5–6)
   - `testingModel` (test executor, standard Step 7). **Recommended:** leave empty (same as `executionModel`). Same host canonical strings as the other model keys.
   - Offer model identifiers exposed by the session host or a custom string; fallback to the active session model if empty or unavailable.

   **Delivery commit artifacts** (subsection of `defaults` / `--section defaults`; writes `defaults.deliveryCommitArtifacts`). Staging SoT: [`ARTIFACTS.md`](../ws-spec-to-pr/ARTIFACTS.md) § Step 8. `autoMode`: accept Recommended on all three gates without prompting.

   | Gate | Writes | Options (Recommended first) |
   |------|--------|-----------------------------|
   | A — Include refined plan (or plan fallback) in delivery commit? | `includeRefinedPlan` | **Yes (`true`, Recommended)** / No (`false`) / Keep current / Skip |
   | B — Include delivery result (`step-08-*.result.md`)? | `includeDeliveryResult` | **No (`false`, Recommended)** / Yes (`true`) / Keep current / Skip |
   | C — Opt-in extras | `includeSpec`, `includeCheckReport`, `includeCodeReview`, `includeTestingReport` | Multi-select or sequential per-toggle; **Recommended = none** (all `false`); Keep current / Skip |

   Merge-write into `config.json` without deleting unknown keys; preserve `_comment*` keys.
8. `domain` / `rules` — optional
9. `autoload` — optional (or standalone `--section autoload`)
10. `security` — optional pre-commit hook enablement gate:
    - User-gate: **Install git pre-commit secrets leak review hook (`ws-secrets-leak-review`)?**
    - Options: **No (`false`, Recommended)** / Yes (`true`) / Skip.
    - Execution on Yes: `bash {skillsRoot}/ws-secrets-leak-review/scripts/install-hook.sh`.

Each user-gate: **Accept suggestion (Recommended)** / **Keep current** / **Edit…** / **Skip**.

## Security & Pre-Commit Hook

Optional interview gate to install secrets leak scanning into consumer `.git/hooks/pre-commit`.

| Signal | Suggest | Action |
|--------|---------|--------|
| `.git/hooks/pre-commit` contains `ws-secrets-leak-review-hook` | Hook already active | Keep current / Skip |
| Hook missing | **No (`false`, Recommended)** / Yes (`true`) / Skip | On **Yes**: run `bash {skillsRoot}/ws-secrets-leak-review/scripts/install-hook.sh` |

## Autoload

Persists `defaults.autoload` (boolean; omitted/missing/`false` → effective false) and refreshes `{sharedDir}/autoload.md`. When enabled (`true`), also creates/refreshes repo-root `AGENTS.md`.

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `defaults.autoload` | boolean | `false` | When `true`, consumer intends root `AGENTS.md` to autoload Always-applied skills from `{sharedDir}/autoload.md` |

| Signal | Suggest |
|--------|---------|
| `{sharedDir}/autoload.md` missing | Install/update workflows hub (installer copies `autoload.md` via hub whitelist) |
| Always-applied skill has `SKILL.md` under project `.agents/skills/` | Path `.agents/skills/ws-<id>/SKILL.md` |
| Skill only under global skills root | Path `{globalSkillsRoot}/ws-<id>/SKILL.md` |
| Skill missing both places | Keep `{skillsRoot}/…` token; harness `--check` warns |
| Enable consumer root autoload? | **No (`false`, Recommended)** / Yes (`true`) / Keep current / Skip |
| User chooses Yes (`true`) | Root write **first** (`--write-autoload` + `--write-root-agents`); persist `defaults.autoload: true` only after root succeeds. Non-generated root → user-gate overwrite/`--force` (Recommended: No → leave flag false) |
| User chooses No / Skip / Keep false | Write or leave `defaults.autoload: false`; root `AGENTS.md` optional (do not require) |

**Enablement gate options:** No (`false`, **Recommended**) / Yes (`true`) / Keep current / Skip.

**Helper (agents and tests):**

```bash
# Yes path order (root before flag). Script also runs write-root before --set-autoload true when combined.
python {skillsRoot}/ws-configure-project/scripts/configure_autoload.py --write-autoload --write-root-agents [--force]
python {skillsRoot}/ws-configure-project/scripts/configure_autoload.py --set-autoload true
python {skillsRoot}/ws-configure-project/scripts/configure_autoload.py --set-autoload false
python {skillsRoot}/ws-configure-project/scripts/configure_autoload.py --check --json
```

Default `--repo-root` is the consumer **cwd**. Pass `--repo-root <dir>` when cwd is not the target project. Use `--force` only when overwriting a non-generated root `AGENTS.md` (creates `AGENTS.md.bak`). Never persist `defaults.autoload: true` if root write was refused.

**Path rules:** never write absolute paths (`C:\…`, `/Users/…`). Markdown links use real relative targets; prose may use `{skillsRoot}` / `{globalSkillsRoot}` / `{sharedDir}` tokens.

## Write rules

- Merge into existing JSON; do not delete unknown keys.
- Preserve `_comment*` keys from the example when present.
- After write: show path `.agents/skills/ws-shared/config.json` and remind it is gitignored.
- Autoload writes: `defaults.autoload` in `{sharedDir}/config.json`; `{sharedDir}/autoload.md` (Always-applied paths); repo-root `AGENTS.md` only when enablement is `true` (after user-gate) — installer never creates root `AGENTS.md`.
