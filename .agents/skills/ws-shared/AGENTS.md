# Shared — Workflow Config & Consumer Data Hub

**Audience: agents** (config resolution, gates, skill loading, consumer-owned paths). Humans: install narrative in the project README or upstream [workflow-skills](https://github.com/jpolvora/workflow-skills) README.

> **Config, gates, bootstrap docs, skill loading, and consumer-owned project data** for [`ws-spec-to-pr`](../ws-spec-to-pr/SKILL.md) and [`ws-spec-to-pr-lite`](../ws-spec-to-pr-lite/SKILL.md).
>
> This folder is **not** an installable skill package. The installer copies hub templates here when a workflow or Full package is selected.
>
> Promoted utilities and harness skills live as **top-level** installable skills under `.agents/skills/<skill>/`.
>
> **Consumer-owned** (preserved on update; never overwritten by upstream):
> `config.json`, `STACK.md`, `MEMORY.md`, `memory/*`, `installed-skills.json`, and `CHANGELOG.md` (when `rules.changelogFile` points under `ws-shared/`).
> Fresh install seeds `config.json` from `config.json.example`, empty `MEMORY.md` / `CHANGELOG.md` from templates, and `STACK.md` from `STACK.md.example`. Prefer [`ws-configure-project`](../ws-configure-project/SKILL.md) to fill placeholders. The installer writes `installed-skills.json` for update/uninstall tracking.
>
> **Installer scope:** skill packages install to **project-local** `.agents/skills/` and/or **global** `$HOME/.agents/skills/` (`--global` / `WORKFLOW_SKILLS_GLOBAL_DIR`). This `ws-shared/` hub under the **project** is where `ws-configure-project` writes consumer data. Never creates or overwrites consumer repo-root files (root `AGENTS.md`, host pointers). Optional root/host pointers stay consumer-owned; ws-check-harness may suggest them.
>
> **Hybrid / override (mandatory):** Agents may load `ws-*` skill bodies from the global skills root while reading **project** `$PWD/.agents/skills/ws-shared/config.json`. **Local (project) config always overrides global hub config.** Upstream skill SoT is `.agents/skills/ws-*` (see root `AGENTS.md` § Skill SoT, install scopes & config override).

**Language:** en-us only for skill bodies, gates, banners, and harness docs.

---

## Config & Tools

| File | Purpose |
|------|---------|
| [`config.json.example`](config.json.example) | Project config template — seeded to `config.json` on fresh install; fill via [`ws-configure-project`](../ws-configure-project/SKILL.md); never commit |
| [`config.schema.json`](config.schema.json) | JSON Schema for `config.json` validation |
| [`config-resolution.md`](config-resolution.md) | Canonical config path + SCM resolution (dual-mode) |
| [`scm-provider-contract.md`](scm-provider-contract.md) | Required SCM intents (`ws-github-provider` ↔ `ws-azure-devops-provider` parity) |
| [`gates.md`](gates.md) | Shared user-gate / delivery / ship / session-model banner (dual-mode) |
| [`tools.md`](tools.md) | Canonical agent tool vocabulary (aliases → config keys), **Path tokens** (`{skillsRoot}` / `{sharedDir}` / `{plansDir}`), script launchers (`python` / `node` / `bash`). Load with `config.json` before tool calls. |
| [`CATALOG.md`](CATALOG.md) | On-demand promoted-skill inventory and consumer task router |
| [`CROSS-PLATFORM.md`](CROSS-PLATFORM.md) | UTF-8, quoting, and explicit-launcher runtime contract |
| [`autoload.md`](autoload.md) | Always-applied skill list + **specs vocabulary / progressive-disclosure router** (which specs skill to load) + **hub contracts** (SCM parity, verify score) |
| [`STACK.md.example`](STACK.md.example) | Template for human-readable stack companion — seeds `STACK.md` |
| [`setup.md`](setup.md) | Bootstrap & entry logic shared by `ws-spec-to-pr` and `ws-spec-to-pr-lite` |
| [`MEMORY.md.template`](MEMORY.md.template) | Empty memory index template — seeds `MEMORY.md` |
| [`CHANGELOG.md.template`](CHANGELOG.md.template) | Empty ws-changelog stub — seeds `CHANGELOG.md` |
| [`skill-dependencies.json`](skill-dependencies.json) | Install graph + **`packageVersion`** + single **`upstream`** ownership block (no per-skill `upstream:` in SKILL.md) |
| [`scripts/`](scripts/) | Resolver helpers for hybrid/global installs: `resolve_consumer_root.py` / `resolve_consumer_root.cjs` (`--repo-root` → cwd hub probe → `parents[4]` when script is project-local) |

## Consumer-owned (local only)

| File | Purpose |
|------|---------|
| `config.json` | Project identity, stack, verification, providers (seeded; gitignored) |
| `STACK.md` | Human-readable companion to `config.json` (edit freely) |
| `MEMORY.md` | Compiled anti-regression index (`ws-self-learning` skill) |
| `memory/*.md` | Individual memory entries (compile into `MEMORY.md`) |
| `backend.md` | Consumer-owned backend architectural patterns & rules (`ws-patterns-backend` skill) |
| `frontend.md` | Consumer-owned frontend UI/UX patterns & rules (`ws-patterns-frontend` skill) |
| `CHANGELOG.md` | Append-only history (`ws-changelog` skill; default `rules.changelogFile`) |
| `installed-skills.json` | Managed skill list for `update` / `uninstall` (installer-written) |

---

## Skill loading (mandatory)

| Skill | Path | Trigger |
|-------|------|---------|
| `ws-karpathy-guidelines` | [`../ws-karpathy-guidelines/SKILL.md`](../ws-karpathy-guidelines/SKILL.md) | Every prompt — surgical scope |
| `ws-changelog` | [`../ws-changelog/SKILL.md`](../ws-changelog/SKILL.md) | Every task completion |
| `ws-self-learning` | [`../ws-self-learning/SKILL.md`](../ws-self-learning/SKILL.md) | Before plan/code/fix: consult `{sharedDir}/MEMORY.md` (keywords + path matching); on completion: write traps / failure reflection → compile |

`ws-tdah` is **on-demand** here (invoke `/ws-tdah` · `/tdah` · `start ws-tdah`). Upstream root `AGENTS.md` inlines a compact session contract for dogfood (does not `Read` live `ws-tdah`); that is not the consumer default.

### Consumer root override (dual-hub)

Default **shared hub only** (typical consumer install): `ws-tdah` and `ws-senior-developer` are **on-demand** — `ws-tdah` via explicit invoke; `ws-senior-developer` via `rules.seniorDeveloper` or explicit invoke. Neither is in the mandatory autoload table above.

Some consumers set `defaults.autoload: true` and add a **root** `AGENTS.md` (installer never writes it; generate via [`ws-configure-project`](../ws-configure-project/SKILL.md) `--section autoload`) that promotes skills listed in [`autoload.md`](autoload.md) (Always-applied table) and/or `ws-tdah` / `ws-senior-developer` to per-prompt autoload. That is an **intentional consumer override**, not a shared-hub defect. Effective autoload is **false** when `config.json` is missing, the key is omitted, or the value is not explicit `true`. **`ws-karpathy-guidelines` remains in this hub's mandatory Skill loading table** and is not part of the Always-applied promotion set (see `autoload.md` complement note).

**Specs progressive disclosure:** when the user mentions specs, plans, Spec-to-PR, `index.PRD`, or related keywords without naming a skill, load [`autoload.md`](autoload.md) § Specs vocabulary and § Specs skill router — then load **only** the matching skill.

**Hub contracts (load on demand):** SCM intents / GitHub vs Azure parity → [`scm-provider-contract.md`](scm-provider-contract.md) (one provider `SKILL.md` only when executing that SCM). Check-implementation / verify score / `scoreAndRefine` → orch Step 5 or [`ws-verify-plan`](../ws-verify-plan/SKILL.md); gate copy in [`gates.md`](gates.md) (advance at score ≥ 9). Config / tokens / gates → `config.json` + [`tools.md`](tools.md) / [`gates.md`](gates.md) — not a skill body.

When **both** hubs load in one session, root `AGENTS.md` skill-loading and precedence sections **win** for autoload decisions over shared-hub opt-in wording here.

See also: [`setup.md`](setup.md) § External dependencies · upstream root `AGENTS.md` § Upstream session contract (dogfood; not live skill autoload).

### Precedence (highest first)

1. Explicit user instructions (current turn)
2. Consumer root `AGENTS.md` when present (skill loading + precedence — overrides shared-hub opt-in defaults)
3. Design / spec / architecture constraints
4. `ws-karpathy-guidelines`
5. `ws-senior-developer` when autoloaded (root hub, `autoload.md`, or `rules.seniorDeveloper` set; opt out via `stop ws-senior-developer` or unset path)
6. `ws-fable-method` when autoloaded (root / `autoload.md`; defer Plan-First when orch owns session or senior plan already confirmed)
7. `ws-tdah` when autoloaded (root hub, `autoload.md`, or `/ws-tdah`; opt out via `stop ws-tdah` / `stop verbosity` / `normal mode`)

### Opt-out

| Phrase | Effect |
|--------|--------|
| `stop ws-tdah` / `stop verbosity` / `normal mode` | Disable ws-tdah |
| `stop ws-gabarito` / `sem ws-gabarito` | Same disable (retired alias) |
| `stop ws-senior-developer` | Disable ws-senior-developer when autoloaded |
| `/ws-tdah` · `/tdah` · `start ws-tdah` · `start ws-gabarito` | Activate (single default mode) |

---

## Promoted skills (top-level installables)

Inventory tables: [`CATALOG.md`](CATALOG.md) (on demand). Extra package rows live in the companion so Workflows-only installs can omit Extra routes without editing this file.

## Task router (consumer)

Intent → skill table: [`CATALOG.md`](CATALOG.md) § Task router (consumer). Specs keywords: [`autoload.md`](autoload.md) § Specs skill router. Pipeline steps 0–9: use orchestrator dispatch (do not invent alternate folder ids).

| Intent (utility shortcuts) | Load |
|----------------------------|------|
| Explain spec / US status & delivery panorama | `ws-spec-explain` |
| Archive plan history into `index.PRD` / clean shipped plan dirs | `ws-spec-archive` |
| Clean workflow leftovers / shipped plan dirs | `ws-cleanup` |

**Product-commit order (both orch):** after verify (standard Step 5, score ≥ 9) or after implement (lite Step 2), commit workflow-touched product files; then code-review against `{base}...HEAD`; then a second product commit for review fixes if any. `{plansDir}` still only at Step 8 / lite Step 4 delivery. Never `git add -A`.

## Managed skills — no silent local refactors

Skills under `.agents/skills/` (except consumer-owned `ws-shared/` data) are **managed upstream copies**. `update` overwrites them.

| Context | Do | Do not |
|---------|----|--------|
| **Consumer repo / CI / Actions** | Verify a real runtime bug with evidence. If a lasting skill/script fix is needed, **tell the user to fix upstream** ([workflow-skills](https://github.com/jpolvora/workflow-skills) PR) or open that PR; local experiments are temporary only. | Autonomously reorder, “hygiene-refactor,” or rewrite managed skill scripts from a false positive (e.g. Python same-module call-before-`def` is not a `NameError`). |
| **Managed script calls** | Invoke with explicit launchers (`python` / `node` / `bash`) per [`tools.md`](tools.md) § Script launchers. On failure: report and stop. | Rewrite managed scripts for shell quirks, or invent temp scanners/bridges when a recipe fails. |
| **Agent shell scans** | Prefer `python -m py_compile` on real `*.py` paths, or a short **uncommitted** temp script if a one-liner heredoc breaks on quoting. Delete temps when done. | Commit throwaway scanners into the consumer tree, or treat shell `SyntaxError` in an embedded heredoc as a skill-script bug. |

Prefer reporting + upstream suggestion over silent local churn.

---

## Cross-platform runtime

Load [`CROSS-PLATFORM.md`](CROSS-PLATFORM.md) before creating shell recipes or temporary scripts. It is the canonical UTF-8, quoting, and explicit-launcher contract.

---

## Recommended Feature Delivery Checklist (before push / ship)

### Consumer Projects

Run this checklist prior to triggering `/ship-pr` or shipping features in a consumer project:

- [ ] **1. Run Tests & Verification**: Execute local test commands (`verification.backendTest` / `verification.frontendTest` or project test scripts).
- [ ] **2. Harness & Workflow Audit**: Run `ws-check-harness` / `ws-check-workflows` to ensure 0 critical findings.
- [ ] **3. Configure & Verify Project**: Verify `.agents/skills/ws-shared/config.json` settings and stack definitions.
- [ ] **4. Clean Docs & Artifacts**: Ensure documentation files have no merge conflict markers or uncommitted scratch files.
- [ ] **5. Ship via `ship-pr`**: Execute `/ship-pr` (runs Prepare Board, commits, pushes, creates PR).

### Upstream Maintainers (`jpolvora/workflow-skills` source repo only)

Additional obligations when maintaining and releasing the upstream skills package:

- [ ] **1. Run Package Tests**: Execute `npm run test` (runs installer, integrity checks, and tree verification).
- [ ] **2. Single Version Bump**: Increment package version once per release PR and stamp site footer (`npm run build-site:bump`).
- [ ] **3. Regenerate Integrity Manifest**: Run `npm run generate-integrity` and `npm run verify-integrity`.
- [ ] **4. Harness Audit**: Run `ws-check-harness` to ensure 0 critical findings.
- [ ] **5. Hub Sync**: Keep the upstream root `AGENTS.md` and this hub (`ws-shared/AGENTS.md` + [`autoload.md`](autoload.md)) in sync before shipping PR.
- [ ] **6. FEATURES Sync**: Update [`FEATURES.md`](../../../FEATURES.md) when shipped capabilities change.

---

## Skill discovery (consumers)

Installed skills live at `.agents/skills/<name>/SKILL.md`. Load on demand from orchestrator dispatch, task intent, or host skill discovery. The installer ships **no** separate packaged agent index — **this file** is the consumer-facing hub. A thin root `AGENTS.md` (when the consumer adds one) should point here — installer never writes it.

---

## External dependencies

Full table and Code review proof notes: [`CATALOG.md`](CATALOG.md) § External dependencies. Resolve `rules.*` and workflow artifact paths from project `config.json` (first match wins).
