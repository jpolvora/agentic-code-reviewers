# CATALOG.md — Promoted skill index (on demand)

**Audience: agents.** Load when listing promoted installables or the consumer task router inventory. Hub routing rules stay in `AGENTS.md`.

## Promoted skills (top-level installables)

### Utilities (Workflows package)

| Skill | Path |
|-------|------|
| `ws-tdah` | [`../ws-tdah/SKILL.md`](../ws-tdah/SKILL.md) |
| `ws-karpathy-guidelines` | [`../ws-karpathy-guidelines/SKILL.md`](../ws-karpathy-guidelines/SKILL.md) |
| `ws-fable-method` | [`../ws-fable-method/SKILL.md`](../ws-fable-method/SKILL.md) |
| `ws-fable-domain` | [`../ws-fable-domain/SKILL.md`](../ws-fable-domain/SKILL.md) |
| `ws-spec-format` | [`../ws-spec-format/SKILL.md`](../ws-spec-format/SKILL.md) |
| `ws-classify-complexity` | [`../ws-classify-complexity/SKILL.md`](../ws-classify-complexity/SKILL.md) |
| `ws-configure-project` | [`../ws-configure-project/SKILL.md`](../ws-configure-project/SKILL.md) |
| `ws-goal-loop` | [`../ws-goal-loop/SKILL.md`](../ws-goal-loop/SKILL.md) |
| `ws-self-learning` | [`../ws-self-learning/SKILL.md`](../ws-self-learning/SKILL.md) |
| `ws-changelog` | [`../ws-changelog/SKILL.md`](../ws-changelog/SKILL.md) |
| `ws-spec-index` | [`../ws-spec-index/SKILL.md`](../ws-spec-index/SKILL.md) |
| `ws-spec-list` | [`../ws-spec-list/SKILL.md`](../ws-spec-list/SKILL.md) |
| `ws-sync-spec` | [`../ws-sync-spec/SKILL.md`](../ws-sync-spec/SKILL.md) |
| `ws-activity-report` | [`../ws-activity-report/SKILL.md`](../ws-activity-report/SKILL.md) |
| `ws-pre-daily` | [`../ws-pre-daily/SKILL.md`](../ws-pre-daily/SKILL.md) |
| `ws-spec-explain` | [`../ws-spec-explain/SKILL.md`](../ws-spec-explain/SKILL.md) |
| `ws-spec-archive` | [`../ws-spec-archive/SKILL.md`](../ws-spec-archive/SKILL.md) |
| `ws-cleanup` | [`../ws-cleanup/SKILL.md`](../ws-cleanup/SKILL.md) |
| `ws-senior-developer` | [`../ws-senior-developer/SKILL.md`](../ws-senior-developer/SKILL.md) |
| `ws-patterns-backend` | [`../ws-patterns-backend/SKILL.md`](../ws-patterns-backend/SKILL.md) |
| `ws-patterns-frontend` | [`../ws-patterns-frontend/SKILL.md`](../ws-patterns-frontend/SKILL.md) |

### Harness & review (Workflows package)

| Skill | Path |
|-------|------|
| `ws-check-harness` | [`../ws-check-harness/SKILL.md`](../ws-check-harness/SKILL.md) |
| `ws-check-workflows` | [`../ws-check-workflows/SKILL.md`](../ws-check-workflows/SKILL.md) |
| `ws-doctor` | [`../ws-doctor/SKILL.md`](../ws-doctor/SKILL.md) |
| `ws-audit` | [`../ws-audit/SKILL.md`](../ws-audit/SKILL.md) |
| `ws-secrets-leak-review` | [`../ws-secrets-leak-review/SKILL.md`](../ws-secrets-leak-review/SKILL.md) — scan; optional pre-commit hook is user-requested only |
| `ws-fable-judge` | [`../ws-fable-judge/SKILL.md`](../ws-fable-judge/SKILL.md) |

### Extra package (optional)

Present only after Extra or Full install. If a path is missing, treat as intentional omission (not a broken route).

| Skill | Path |
|-------|------|
| `ws-write-a-skill` | [`../ws-write-a-skill/SKILL.md`](../ws-write-a-skill/SKILL.md) |
| `ws-show-harness` | [`../ws-show-harness/SKILL.md`](../ws-show-harness/SKILL.md) |
| `ws-preview` | [`../ws-preview/SKILL.md`](../ws-preview/SKILL.md) |

### Intentionally orch-only (not duplicated here)

Pipeline folders `ws-write-spec`…`ws-fix-pr`, `ws-goal-fix-pr`, `ws-update-plan-implementation`, orchestrators (`ws-spec-to-pr`, `ws-spec-to-pr-lite`, `ws-multi-spec`), and providers are discovered via host invoke / orch dispatch — not listed as promoted utilities.

Install packages and dependency map: upstream `bin/skill-dependencies.json` in [workflow-skills](https://github.com/jpolvora/workflow-skills) (not vendored in consumer clones).

---

## Task router (consumer)

| Intent | Load |
|--------|------|
| Spec → PR E2E | `ws-spec-to-pr` |
| Spec → PR lite | `ws-spec-to-pr-lite` |
| Batch spec delivery | `ws-multi-spec` |
| Project spec index init/sync/promote | `ws-spec-index` |
| List / manage specs vs plan workflows (dual board + menu) | `ws-spec-list` |
| Timesheet / activity hours for a delivery day | `ws-activity-report` |
| Standup briefing (last 36 hours) | `ws-pre-daily` |
| Explain spec / US status & delivery panorama | `ws-spec-explain` |
| Archive plan history into `index.PRD` / clean shipped plan dirs | `ws-spec-archive` |
| Clean workflow leftovers / shipped plan dirs | `ws-cleanup` |
| Auto-update feature specs after code changes | `ws-sync-spec` |
| Fable Method 7-step loop | `ws-fable-method` |
| Classify spec pipeline complexity | `ws-classify-complexity` |
| Adversarial audit / fraud scan | `ws-fable-judge` |
| Domain adapters (DevOps/Data/Research) | `ws-fable-domain` |
| Engineering delivery gate / Code review proof | `ws-senior-developer` (default on-demand; opt in via `rules.seniorDeveloper`; root `AGENTS.md` may autoload — see § Consumer root override) |
| Backend patterns & architectural preferences | `ws-patterns-backend` |
| Frontend UI/UX patterns & component preferences | `ws-patterns-frontend` |
| Fill / update `config.json` | `ws-configure-project` (optional suggestion only for secrets pre-commit hook — never required) |
| Audit harness | `ws-check-harness` |
| Diagnose skills / doctor the harness | `ws-doctor` |
| Runtime workflow audit (`defaults.enableAuditing`) | `ws-audit` |
| Check workflows | `ws-check-workflows` |
| Secrets / leaks | `ws-secrets-leak-review` |
| Format/review spec | `ws-spec-format` |
| Specs vocabulary / which specs skill to load | [`autoload.md`](autoload.md) § Specs skill router |
| Verify / check-implementation / verify score | `ws-verify-plan` (advance at score ≥ 9; `scoreAndRefine` below) |
| SCM intent contract / GitHub vs Azure parity | [`scm-provider-contract.md`](scm-provider-contract.md) — then one provider skill |
| Record learning | `ws-self-learning` |
| Record ws-changelog | `ws-changelog` |
| Create / rewrite a skill | `ws-write-a-skill` (Extra) |
| Show active harness | `ws-show-harness` (Extra) |
| Pipeline review / preview CI review | `ws-preview` (Extra) |

Pipeline steps 0–9: use orchestrator dispatch (do not invent alternate folder ids).

**Product-commit order (both orch):** after verify (standard Step 5, score ≥ 9) or after implement (lite Step 2), commit workflow-touched product files; then code-review against `{base}...HEAD`; then a second product commit for review fixes if any. `{plansDir}` still only at Step 8 / lite Step 4 delivery. Never `git add -A`.

---

---

## External dependencies

Not shipped in the hub package (except where noted). Resolve each dependency in **order** (first match wins). Read paths from `config.json` when present. Do **not** assume host-private rule folders.

| Dependency | Resolve (first match) |
|------------|------------------------|
| `senior-developer` | `config.json` → `rules.seniorDeveloper` (set path to opt in; default on-demand in shared hub) → local skill (`senior-developer/SKILL.md`) → global/user skill. Root `AGENTS.md` may autoload — see § Consumer root override |
| `ws-karpathy-guidelines` | `config.json` → `rules.karpathyGuidelines` → shipped `../ws-karpathy-guidelines/SKILL.md` → global skill |
| Stack companion | `config.json` → `rules.stackFile` (default `.agents/skills/ws-shared/STACK.md`) — consumer-owned under `ws-shared/` |
| Changelog file | `config.json` → `rules.changelogFile` (default `.agents/skills/ws-shared/CHANGELOG.md`) |
| Domain glossary | `config.json` → `domain.glossaryFile` (often `CONTEXT.md`) — consumer root, optional |
| Optional consumer rules | Other `config.json` `rules.*` paths when set — do not invent filenames |
| Workflow artifacts | `config.json` → `plans.dir` (token `{plansDir}`; default `.agents/plans`) · `plans.specsDir` (token `{specsDir}`; default `.agents/specs`) · optional `reviews.dir` (token `{reviewsDir}`; default `.agents/codereviews`) |

Bootstrap notes: [`setup.md`](setup.md). Config resolution: [`config-resolution.md`](config-resolution.md).

### Code review proof

When skills ask for **Code review proof**, use the checklist from the **resolved** `rules.seniorDeveloper` skill. Do **not** paste or duplicate that checklist here.
