---
name: ws-spec-explain
version: 0.3.30
disable-model-invocation: true
description: >-
  Read-only panorama of a spec or US/issue — status, what it does, what it
  delivers or delivered, how to check in the project/UI, and how to test.
  Trigger on /ws-spec-explain, /explain, spec explain, or after ship/fix-pr.
invocation_names:
  - ws-spec-explain
  - spec-explain
  - explain
---

# ws-spec-explain

> When this skill is loaded, output "ws-spec-explain loaded."

Read-only status + delivery panorama for one target. Does not edit code, specs, or git state.

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check when config is present. Missing config → local-paths mode with gap `config-missing`.

## Invocation

```text
/ws-spec-explain harness-efficiency-and-verifiability.spec.md
/ws-spec-explain #217
/ws-spec-explain https://github.com/org/repo/issues/42
/explain us-217
ws-spec-to-pr … → ws-ship-pr → ws-goal-fix-pr → ws-spec-explain
```

| Arg | Rule |
|-----|------|
| Spec file | `{specsDir}` or `{us-dir}/step-00-*.spec.md` basename or path |
| US / issue | `#NNN`, `us-NNN`, slug, or tracker URL |
| None | `user-gate` ask for target; cancel → STOP |

Report shape → [`references/REPORT.md`](references/REPORT.md). Output language: match the user.

## Steps

1. **Resolve target** — Expand `{plansDir}` / `{specsDir}` / `{sharedDir}` / `{skillsRoot}` from config + [`../ws-shared/tools.md`](../ws-shared/tools.md). Map arg → slug + candidate paths (`{specsDir}/{slug}.spec.md`, `{plansDir}/{slug}/`, state files). URL → provider id only when `providers.scm` is set.
   - Done when: slug (or explicit gap) and search roots are fixed.

2. **Collect local evidence** — Read in order when present: spec of record → `step-00-*.spec.md` → `*.state.md` → `step-01-*.plan.md` / refined → `step-08-*.result.md` → AC ledger / plan index if present. Record `status`, `currentStep`, `prNumber`/`prUrl`, `branch`, ACs.
   - Done when: local facts + gaps are listed (invent nothing).

3. **Collect code & remote evidence** — Grep / Glob product paths named by the plan or ACs. If SCM configured and id/PR known, load **one** provider skill for issue/PR summary only ([`ws-github-provider`](../ws-github-provider/SKILL.md) / [`ws-azure-devops-provider`](../ws-azure-devops-provider/SKILL.md)). Auth failure → gap `scm-skipped`.
   - Done when: implementation signals (files, PR state) or gaps are attached.

4. **Classify status** — One of: `not-started` · `in-progress` · `delivered` · `blocked` · `unknown` (see REPORT § Status). Prefer state `status` + PR merged/closed over guesswork.
   - Done when: single status label + one-line rationale.

5. **Emit report** — Print REPORT sections: Summary, What it does, What it delivers/delivered, Evidence, How to check (project/UI), How to test. Stop.
   - Done when: all six headings printed; skill stops.

## Rules

- Path tokens only — never hardcode `{plansDir}` / org / repo names.
- Positive enclosure: report observed paths and quotes — never fabricate delivery.
- Reuse SCM provider intents; do not duplicate auth recipes.
- Chain-safe: after `ws-ship-pr` / `ws-goal-fix-pr`, prefer the active `{us-dir}` from that session when the user omits an arg but state is in context.
