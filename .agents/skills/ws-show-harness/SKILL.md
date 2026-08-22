---
name: ws-show-harness
description: Session harness snapshot generator — reports active skills, rules, precedence hierarchy, and capabilities for the current session.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - ws-show-harness
  - show-harness
---

# ws-show-harness

> When this skill is loaded, output "ws-show-harness loaded."

**Leading word:** *snapshot* — what is active **now**, not a disk audit.

Read-only. Emit one report, then **stop**. For integrity/routing audits use [`ws-check-harness`](../ws-check-harness/SKILL.md).

## Steps

1. **Collect** — From this turn's context only, list what is loaded:
   - Entry: root `AGENTS.md` when authoring upstream; after install load `skills/ws-shared/AGENTS.md` (optional project root `AGENTS.md` when the host provides one)
   - Autoload / always-on skills and opt-outs (ws-tdah, karpathy, hooks, etc.)
   - Session-loaded skills (attached, routed, or already Read this turn)
   - Workspace rules + user rules that bind this agent
   - Config / external deps only if already known or a one-line path check (`skills/ws-shared/config.json`)
   - Done when: each category is marked present, absent, or unknown (no invented files).

2. **Summarize** — Emit the report below. Bullet facts only; no skill-body dumps; no fixes.
   - Done when: every section is filled or explicitly `none` / `unknown`, and Can / Cannot has ≥1 bullet each.

## Report format

```markdown
# Harness snapshot

## Entry / hubs
- …

## Precedence (highest first)
- …

## Always-on / autoload
- … (note opt-outs if any)

## Session-loaded skills
- `name` — one-line role

## Rules active
- **Enforce:** …
- **Allow:** …
- **Forbid / guardrails:** …

## Config / external deps
- … or `unknown`

## Can / Cannot
- **Can:** …
- **Cannot:** …
```

## Boundaries

- Prefer context already in the session; light hub reads only to name precedence / autoload tables.
- Do not run ws-check-harness phases, edit files, or propose corrections.
- Do not list every skill on disk — only what is active this moment.
