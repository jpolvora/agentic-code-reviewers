---
name: ws-interview
description: Interactive plan interrogation engine — audits implementation plans to uncover hidden assumptions, resolve ambiguities, and refine technical designs.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - interview
  - ws-interview
---

# ws-interview

> When this skill is loaded, output "ws-interview loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Audit and interrogate the draft plan (`step-01-{slug}.plan.md`) against acceptance criteria, codebase structure, tenancy rules, and invariants.

**Canonical path:** writes `{us-dir}/step-02-{slug}.plan.refined.md`, leaving `step-01-{slug}.plan.md` untouched.

## Invocation

Standalone:

```
@[refine] <plan-path> [spec=<spec-path>]
```

Workflow (ws-spec-to-pr Step 2): dispatched when the orchestrator does not skip interview (see [gates.md](../ws-shared/gates.md) conditional interview). May be skipped entirely for simple plans.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<plan-path>` | required | Path to `step-01-{slug}.plan.md` |
| `spec` | inferred | Path to `step-00-{slug}.spec.md`, inferred from plan folder |
| `softSkipEligible` | false | Orch hint: Open Questions empty; skip escalation when `blocking_open == 0`, but still Resolve (sweep) non-blocking gaps before defaults |

## Grilling Protocol (hard rules)

1. **Project-context sweep first** — before asking or applying an ungrounded default, search project sources for the best answer (as applicable to the gap):
   - Related specs: `{specsDir}/**/*.spec.md`, `{plansDir}/**/step-00-*.spec.md`, current US `step-00`
   - Memory: `{sharedDir}/MEMORY.md` and `{sharedDir}/memory/*` (honor **DO NOT** / **INSTEAD DO**)
   - Codebase and established design patterns (layers from `config.json`)
   - Architecture / domain: `domain.architectureSpec`, `domain.glossaryFile`, `rules.stackFile`, ADRs, schema when present
   - Rules / guides: `config.json` → `rules.*`, hub `AGENTS.md`, configured standards skills
   Prefer project evidence over model preference when they conflict. Resolve discoverable gaps automatically and record evidence.
2. **Walk the design tree** — resolve foundational gaps (scope/schema) before details (UI/i18n).
3. **Surgical escalation** — ask exactly one question per round; include the recommended solution as the first choice.
4. **Escalation cap** — max 3 rounds of user questions; on the 4th, apply sensible defaults and exit.
5. **No code edits** — write only refined plans and metadata.

## Steps

1. **Audit** — Scan sections 0-8 of the plan, run scenario probes (soft-deletion, concurrency, list sizing, rate limits), and register each finding in a `gap_registry` (`id`, `class`, `section`, `gap`, `recommendation`, `status`, `dependsOn`). Classify each gap `blocking` (prevents development or changes AC) or `non-blocking` (quality/optimization, apply via defaults).
   - Done when: every section 0-8 has been scanned and every finding is registered.

2. **Resolve** — For each registered gap, run the project-context sweep. On a confident project hit: close the gap, set `resolutionSource: project`, and append evidence (path(s) + short rationale) to the registry (embed in `resolution` if the orch only reads that string). Prefer project-sourced answers over model preference. Non-blocking gaps with no project hit: apply sensible defaults (`resolutionSource: assumed-default`) without escalating.
   - Done when: every non-blocking gap is closed, and every blocking gap with a project-sourced answer is closed.

3. **Escalate / auto-fallback** — Only after a sweep miss on a **blocking** gap:
   - **`autoMode` (or workflow auto-answer):** apply best technical judgment / sensible default; set `resolutionSource: model-inferred` with rationale; do **not** emit `needs_user` / `user-gate` for that gap.
   - **Interactive (not auto):** standalone → prompt via `user-gate`; workflow → `status: needs_user` per the Grilling Protocol (one question, recommended option first). After escalation cap, apply defaults (`assumed-default`).
   - Done when: no blocking gap remains unresolved and unescalated, or autoMode / cap defaults closed the remainder.

4. **Confirm shared understanding** — Workflow: treat as confirmed when the orchestrator already auto-confirmed via "End refinement and advance" (do not re-prompt); otherwise return `shared_understanding: pending`. Standalone: prompt the user to confirm.
   - Done when: `shared_understanding` is `confirmed`, or `pending` was returned to the orchestrator.

**Fast exit:** when `softSkipEligible` and Step 1 finds `blocking_open == 0`, skip escalation and set `shared_understanding: confirmed`, but still run Resolve (project-context sweep) for any registered **non-blocking** gaps before applying defaults. Do not skip the sweep solely because no blocking gaps remain.

## Outputs

- `step-02-{slug}.plan.refined.md` with frontmatter `status: "plan refined ok"` and an appended `## Interview registry` table (include `resolutionSource` / evidence columns when available).

### step-output (workflow mode)

```yaml
status: success | needs_user
refine:
  registry: [{id, class, section, gap, status, resolution, resolutionSource?, evidence?, dependsOn?}]
  # resolutionSource: project | model-inferred | assumed-default
  # evidence: path(s) + short rationale (optional; may be inlined in resolution)
  round: number
  blocking_open: number
  shared_understanding: pending | confirmed
needs_user:
  question: string              # ONE question only
  options: [{id, label}]        # recommended choice first
  context: string
  design_branch: string         # e.g., "Authorization / tenant"
```

## Subagent contract

- Audit the plan against the supplied spec, memory traps, and project evidence.
- Resolve project-observable gaps before escalating one blocking question.
- Preserve every AC mapping and record resolution source.
- Write only the refined plan and return the closed/open registry.

