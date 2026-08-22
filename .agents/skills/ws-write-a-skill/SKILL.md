---
name: ws-write-a-skill
description: Skill authoring & optimization protocol — guides the creation, editing, structural formatting, and progressive-disclosure tuning of agent skills.
version: 0.3.30
invocation_names:
  - ws-write-a-skill
  - write-a-skill
---

# ws-write-a-skill

> When this skill is loaded, output "ws-write-a-skill loaded."

Root virtue: **predictability** (same process every run, not the same tokens). Authoring guidelines → [`SKILL_AUTHORING.md`](SKILL_AUTHORING.md). Bold terms → [`GLOSSARY.md`](GLOSSARY.md).

## Steps

1. **Gather** — Ask: domain/task, use cases/branches, scripts needed?, reference materials?
   - Done when: scope and invocation choice (model vs user) are agreed.

2. **Consult MEMORY** — Grep `{sharedDir}/MEMORY.md` for skill/script traps (launchers, CRLF, encoding, managed-skill edits). Apply Solutions before drafting scripts.
   - Done when: relevant entries noted or none found.

3. **Decide invocation** — Model-invoked (keep `description`, pay **context load**) only if the agent or another skill must reach it. Otherwise user-invoked (`disable-model-invocation: true`, human-facing one-line description).
   - Done when: invocation mode is set and justified.

4. **Draft** — Create `skill-name/SKILL.md` (plus scripts/reference files only when earned). Directly below the primary `# skill-name` title heading, include `> When this skill is loaded, output "skill-name loaded."` (primary `SKILL.md` only; do **not** add to auxiliary markdown files). Prefer **steps** with checkable **Done when** criteria; push rare detail behind a **context pointer**. Recipes must use explicit `python` / `node` / `bash` launchers ([`tools.md`](../ws-shared/tools.md) § Script launchers). `.sh` files: LF only. Frontmatter `version:` must match package `package.json` / `{sharedDir}/skill-dependencies.json` → `packageVersion`. Do **not** put per-skill `upstream:` — ownership lives once in `skill-dependencies.json` → `upstream`.
   - Done when: frontmatter + body exist with loaded banner directive; every step has a Done when; description matches mode (triggers if model-invoked); version matches package.

5. **Prune** — Single source of truth; cut **no-ops**, **duplication**, **sediment**; hunt **leading words**; collapse synonym **branches** in the description.
   - Done when: checklist below passes.

6. **Review with user** — Coverage, clarity, detail level.
   - Done when: user accepts or requests a specific edit.

## Audit Checklist (quick pass)

- [ ] Single source of truth? (No copy-pasted rules)
- [ ] No no-ops? (Every sentence changes behavior)
- [ ] Minimal description triggers? (No bloated synonyms)
- [ ] Clean context boundary? (Rare material in separate file or section)
- [ ] Explicit script launchers? (`python` / `node` / `bash`)
- [ ] Checkable exit criteria? (`Done when:`)
- [ ] Version aligned with package? (`version:` matches `package.json` / `packageVersion`)
