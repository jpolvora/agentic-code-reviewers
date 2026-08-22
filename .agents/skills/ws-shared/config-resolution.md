# Config & SCM Resolution — Dual-Mode

Canonical config and SCM resolution for **all** workflow skills.
Used by `ws-spec-to-pr`, `ws-spec-to-pr-lite`, providers, `ws-fix-pr`, `ws-goal-fix-pr`, `ws-ship-pr`.

---

## Entry check

Resolve the project-local `{sharedDir}/config.json` before any config-dependent skill action. If it is missing or still contains required placeholders, use `user-gate` to recommend `ws-configure-project`; cancellation stops the action and never implies approval. Project config always overrides a global hub.

---

## Config path (only)

```text
.agents/skills/ws-shared/config.json
```

Template: [`config.json.example`](config.json.example). Schema: [`config.schema.json`](config.schema.json).

**Forbidden as primary runtime config:**

- `.agents/skills/ws-spec-to-pr/config.json`
- `.agents/skills/ws-spec-to-pr-lite/config.json`

Scripts and skills that still mention those paths are **bugs** — fix to `{sharedDir}/config.json` (expand per [tools.md](tools.md) § Path tokens; default `.agents/skills/ws-shared/config.json`). Lite and full always share this file (dual-mode).

---

## Global execution & local project config check

When skills are executed from a global install (`$HOME/.agents/skills` or `WORKFLOW_SKILLS_GLOBAL_DIR`), they target the local repository at `$PWD`.

- **Config-Dependent Skills** (`ws-spec-to-pr`, `ws-spec-to-pr-lite`, `ws-multi-spec`, `ws-write-plan`, `ws-interview`, `ws-plan-to-tasks`, `ws-implement-tasks`, `ws-verify-plan`, `ws-code-review`, `ws-testing`, `ws-ship-pr`, `ws-fix-pr`, `ws-goal-fix-pr`, providers):
  - **Entry Gate:** Must verify `$PWD/.agents/skills/ws-shared/config.json` exists and is non-empty.
  - **Missing Config:** If missing or unconfigured (`<...>` placeholders), trigger `user-gate` recommending running `ws-configure-project` (which seeds and populates `$PWD/.agents/skills/ws-shared/config.json`).
- **Config-Independent / Standalone Skills** (`ws-configure-project`, `ws-secrets-leak-review`, `ws-karpathy-guidelines`, `ws-tdah`, `ws-write-a-skill`, `ws-spec-format`, `ws-check-harness`):
  - Run directly in any repository without requiring `config.json`.

---

## Path tokens (fixed + configurable)

Load early with `toolsFile` (default `tools.md` § Path tokens).

| Token | Source | Default |
|-------|--------|---------|
| `{skillsRoot}` | `pathTokens.skillsRoot` | `.agents/skills` |
| `{sharedDir}` | `pathTokens.sharedDir` | `.agents/skills/ws-shared` |
| `{plansDir}` | `plans.dir` | `.agents/plans` |
| `{specsDir}` | `plans.specsDir` | `.agents/specs` |
| `{reviewsDir}` | `reviews.dir` | `.agents/codereviews` |

Expand before tool calls. `{skillsRoot}` / `{sharedDir}` are **fixed install layout** (optional `pathTokens` in config for discoverability; not relocatable). `{plansDir}` / `{specsDir}` / `{reviewsDir}` remain consumer-configurable.

---

## SCM provider resolution (`providers.scm`)

1. Read `providers.active` / `providers.scm` from `.agents/skills/ws-shared/config.json`.
2. If `providers` absent: enabled GitHub tracker → `scm=github`; else enabled Azure DevOps → `scm=azure-devops`; else STOP (require explicit `providers.scm`). Prefer GitHub if both enabled.
3. If `scm` absent: if active is `github`|`azure-devops` → scm=active; if active=`local` → parse `project.repoUrl` host (`github.com` → github; `dev.azure.com` / `visualstudio.com` → azure-devops); else STOP.
4. Reject `scm: "local"` for PR/thread/merge intents.
5. Load matching provider skill; call intents by name — do not embed host CLI recipes in consumer skills.

| `providers.scm` | Skill |
|-----------------|-------|
| `github` | [`ws-github-provider`](../ws-github-provider/SKILL.md) |
| `azure-devops` | [`ws-azure-devops-provider`](../ws-azure-devops-provider/SKILL.md) |

Intent names, outputs, and shared rules: [`scm-provider-contract.md`](scm-provider-contract.md). GitHub and Azure DevOps must implement the same required intents. Callers use intent names only.

---

## Workflow mode flag

When dispatched from an orchestrator, skills receive (via subagent / `dispatch-agent` prompt / state):

| Field | Values | Meaning |
|-------|--------|---------|
| `workflowType` | `standard` \| `lite` | Which orch owns the run |
| `workflowMode` | `true` when under orch | Suppress re-ask at user-gate for ship / commit when orch already gated |
| `shipAction` | `create-pr` \| `push-only` \| `skip` | From orch ship gate |

Standalone invokes omit these; skills may present their own gates.


---

## Fable integration resolution (`fable`)

Optional integration block for `fable-*` skills in `ws-spec-to-pr` / `ws-spec-to-pr-lite` workflows.

1. Read `fable` object from `.agents/skills/ws-shared/config.json`.
2. Default in fresh `config.json.example`: `enabled: true`. Default if absent in legacy config: `enabled: false` (strictly opt-in).
3. When `fable.enabled: true`:
   - `autoAudit` (default `true`): `ws-code-review` (Step 6) and `ws-verify-plan` (Step 5) run adversarial audit via `ws-fable-judge`.
   - `autoDetectDomain` (default `true`): `ws-write-plan` (Step 1) auto-detects specialized stack files and applies `ws-fable-domain` evidence rules.
   - `auditVerdictsBlockShip` (default `"refuted"`): accepts `false`, `"refuted"`, or `"caveats"`. `REFUTED` is the unconditional safety floor and always blocks; `"caveats"` additionally blocks `VERIFIED WITH CAVEATS`.

---

## Runtime audit resolution (`defaults.enableAuditing`)

Optional runtime observer for `ws-spec-to-pr` / `ws-spec-to-pr-lite` / `ws-multi-spec` (via [`ws-audit`](../ws-audit/SKILL.md)).

| Condition | Effective `enableAuditing` |
|-----------|----------------------------|
| No project `{sharedDir}/config.json` | `false` |
| Key omitted / null / unreadable | `false` |
| Explicit `true` / `false` | that value |

When `true`: orch initializes audit log under `{us-dir}`, appends findings for script/tool/I/O/dispatch anomalies (including recovered skill defects), performance bottlenecks, correctness risks, and disposable scratch scripts, and finalizes at run end. Actionable `error` findings trigger `user-gate` proposing a GitHub issue on the package upstream repo; actionable reusable tooling suggestions / disposable script detections trigger `user-gate` proposing upstream script pre-generation.

When `false`: no audit log obligation; no end-of-run issue gate from this feature.

Resolve helper:

```bash
node {skillsRoot}/ws-audit/scripts/audit_log.js resolve [--config "{sharedDir}/config.json"]
```

---

## Parallel DAG task execution resolution (`defaults.enableDag`)

Optional setting in `defaults.enableDag` for task execution mode in `ws-spec-to-pr` / `ws-plan-to-tasks` / `ws-implement-tasks`.

| Condition | Effective `enableDag` | Execution Behavior |
|-----------|------------------------|--------------------|
| Key omitted / `false` (default) | `false` | Tasks execute sequentially one by one in serial order using subagents (no parallel tasks/DAG). |
| Explicit `true` | `true` | Tasks break into parallel DAG execution groups (up to 3 concurrent per level) evaluated against `config.json.dagThresholds`. |

