---
name: ws-write-plan
description: Implementation plan generator — transforms feature specifications into structured, technical step-01 implementation plans.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - write-plan
  - ws-write-plan
---

# ws-write-plan

> When this skill is loaded, output "ws-write-plan loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Draft an implementation blueprint from the spec.

**Canonical path:** `{us-dir}/step-01-{slug}.plan.md` (`{us-dir}` = `{plansDir}/{slug}/`).

**Reads:** `config.json` (stack, layers, invariants), `tools.md` / `STACK.md`; consult MEMORY via [`ws-self-learning`](../ws-self-learning/SKILL.md) § Pre-work; when `defaults.patternsFrontend` is true, read `{sharedDir}/frontend.md`; when `defaults.patternsBackend` is true, read `{sharedDir}/backend.md`.

## Invocation

Standalone:

```
/write-plan <spec-input> [slug=<slug>] [output-dir=<path>]
```

Workflow (ws-spec-to-pr Step 1): orchestrator passes `specInput` (path to `step-00-*.spec.md`, GitHub issue id, or Azure DevOps id) from state.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<spec-input>` | required | Local spec path, `GH <id>`, or `US <id>` |
| `slug` | inferred | From spec when omitted |
| `output-dir` | `{us-dir}` | Optional override for destination (`{plansDir}/{slug}/`) |

## Steps

1. **Load spec, stack & pattern context** — Read the spec input and `config.json` layers/invariants; grep `{sharedDir}/MEMORY.md` for plan keywords.
   - **Design intent:** For modification / bugfix ACs, require `git log -p -S` and/or `git log -L` on touched symbols before recommending behavior changes; reference `### Design Intent` from the spec when present.
   - If `defaults.patternsFrontend` is `true`, **Read** `{sharedDir}/frontend.md` (or fallback to `{sharedDir}/frontend.md.template` if missing) to incorporate project UI/UX and styling conventions into the technical design.
   - If `defaults.patternsBackend` is `true`, **Read** `{sharedDir}/backend.md` (or fallback to `{sharedDir}/backend.md.template` if missing) to incorporate domain, architecture, and API conventions.
   - Optional `fable` integration: If `config.json.fable.enabled` and `autoDetectDomain` are `true`, check for domain signals (IaC `*.tf`, K8s `*.yaml`, Docker, DB migrations, Data scripts). If matched, consult [`ws-fable-domain`](../ws-fable-domain/SKILL.md) to append binding primary sources & observation rules into section 2/6.
   - Done when: stack, patterns, and relevant memory entries are identified.



2. **Draft plan** — Write `{us-dir}/step-01-{slug}.plan.md` following [`references/PLAN-TEMPLATE.md`](references/PLAN-TEMPLATE.md) (sections 0–8).
   - For bugfix/regression ACs: §3 Step-by-Step Plan and §5 Test Coverage must name **defect-class sibling sweep** (repo-wide) and **sabotage verification** (`run_sabotage.py` when mutation unset).
   - Done when: every section 0–8 is filled; each requirement maps to ≥1 Step-by-Step Plan entry; every AC maps to ≥1 test case in section 5.

3. **Handoff** — Return the plan path for [ws-interview](../ws-interview/SKILL.md) (or [ws-plan-to-tasks](../ws-plan-to-tasks/SKILL.md) when interview is skipped).
   - Done when: caller has the `step-01-` path.

## Rules of Engagement

- Every AC maps to ≥1 plan step and ≥1 §5 test mapping.
- Do not write product code: this skill is strictly for planning and documentation.
- If the project stack cannot be detected from `config.json`, stop and ask for clarification.

## Subagent contract

- Read only the supplied spec and named project context.
- Map every AC to implementation work, expected files, and a named test.
- Record unresolved design choices explicitly instead of choosing silently.
- Write only the assigned plan artifact and return its path.

