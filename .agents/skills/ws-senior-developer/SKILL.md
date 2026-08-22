---
name: ws-senior-developer
description: Engineering delivery gate for scope control, anti-reinvention, ambiguity stops via user-gate, and pre-ship proof. Invoke via rules.seniorDeveloper or /senior-developer.
version: 0.3.30
invocation_names:
  - senior-developer
  - ws-senior-developer
---

# ws-senior-developer

> When this skill is loaded, output "ws-senior-developer loaded."

Optional model-invoked delivery gate when explicitly invoked or resolved through `rules.seniorDeveloper`. Guides prompting, planning, implementation, and review; does not replace project policy or an installed workflow.

**Complement:** Named orch (`ws-spec-to-pr*`) wins routing (see §1). For non-orch non-trivial investigation without a confirmed plan, prefer [`ws-fable-method`](../ws-fable-method/SKILL.md) for Evidence→Act→Verify structure — do not run a second full plan ceremony. This skill alone owns the **Code review proof** checklist (§5).

When config-resolved: if `$PWD/.agents/skills/ws-shared/config.json` is missing, `user-gate` → run [`ws-configure-project`](../ws-configure-project/SKILL.md) before relying on verification aliases.

## Core Engineering Directives

1. **Suggest unasked changes first:** Never implement features, refactors, or enhancements outside the user request or approved plan. Present opportunistic improvements via `user-gate` and wait for approval.

2. **Audit and simplify:** Before writing custom logic, inspect existing helpers, stdlib, and project patterns. Prefer reuse and simplification that preserves behavior.

3. **Stop on ambiguity:** If requirements or paths are underspecified, stop. Present options with trade-offs via `user-gate` and wait for a decision.

## 1. Route existing intent

If the request names a workflow command, dispatch it through that workflow without adding a competing gate. If it explicitly requests implementation, use the installed implementation capability under `{skillsRoot}` and apply this skill only as its requested delivery constraint.

**Done when:** the applicable workflow or implementation route is identified before review or planning requirements are imposed.

## 2. Classify scope

Treat a trivial or single-file change as exempt from plan ceremony; apply only the focused checks needed for its risk. For multi-file or multi-modification free-text work, continue to planning.

**Done when:** scope class (trivial vs plan-required) is recorded.

## 3. Confirm plan when required

Require a confirmed plan before multi-file or multi-modification free-text work. Use `{plansDir}` for plan artifacts, and route applicable work to installed workflow, specification, and specification-sync capabilities.

During plan confirmation apply Core Directives 1 and 3 (scope enclosure; `user-gate` on ambiguity).

**Done when:** an approved plan identifies scope, verification commands, and any required handoffs.

## 4. Implement within constraints

Make the smallest change that satisfies the confirmed plan. Follow loaded policy and architecture constraints, preserve consumer-owned data, and report a blocker instead of inventing unconfigured commands or dependencies.

Apply Core Directives 1–2 during edits.

**Done when:** implementation matches the approved scope or a concrete blocker is reported.

## 5. Produce pre-ship proof

Before branch or pull-request handoff, provide this Code review proof checklist:

- [ ] Run non-empty configured build, test, and format aliases that apply (`config.json.verification`); cite exit codes.
- [ ] Run configured secrets checking and resolve or report findings.
- [ ] Assess relevant documentation and specification-index updates.
- [ ] Review the changed scope for correctness, regressions, policy compliance, and requested scope only.
- [ ] **Self-learning / Failure reflection**: If $\ge 2$ tool, build, or test failures occurred before passing, record a new memory entry in `{sharedDir}/memory/` with root cause and trap avoided; `Learning: N/A` is strictly forbidden when session friction $\ge 2$.
- [ ] Report command evidence, outcomes, remaining risks, and blockers.

Use configured aliases such as `build-backend`, `test-backend`, and `lint-backend`; do not hardcode consumer commands.

**Done when:** every applicable checklist item has command evidence (exit code) or an explicit blocker.

## Subagent contract

- Refuse unapproved extra scope and name any ambiguity that changes the result.
- Reuse configured project helpers and verification aliases before adding machinery.
- Keep implementation inside the assigned path set.
- Report build, test, format, and security evidence that applies to the changed layer.
- Return blockers honestly; never convert a failed check into a pass.

## Opt-out

| Phrase | Effect |
|--------|--------|
| `stop ws-senior-developer` | Disable for this session when autoloaded |
| Unset `config.json` → `rules.seniorDeveloper` (empty string) | Disable path resolution / opt out of delivery-gate resolve |
