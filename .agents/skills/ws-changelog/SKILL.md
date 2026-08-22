---
name: ws-changelog
version: 0.3.30
description: Summarized task history writer — appends concise, structured task completion records to the project changelog file.
invocation_names:
  - changelog
  - ws-changelog
---

# Changelog

> When this skill is loaded, output "ws-changelog loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

**Mandatory completion gate** — run after [ws-self-learning](../ws-self-learning/SKILL.md) at the end of implementation tasks.

## When to run

Run at the end of every implementation task to maintain a historical record of what was actually built, fixed, or modified.

**Important:** This file is strictly for historical tracking and auditing. It is an append-only file and should NOT be used for reading context or preventing regressions (use `MEMORY.md` for that). Do not re-read or rewrite past entries.

## Path resolution

Resolve the target file from `{sharedDir}/config.json`:

| Source | Path |
|--------|------|
| `rules.changelogFile` when set | that path (repo-relative) |
| Default | `{sharedDir}/CHANGELOG.md` |

Do **not** create or require a repo-root `CHANGELOG.md` unless the consumer explicitly set `rules.changelogFile` to that path (e.g. `"CHANGELOG.md"`).

## Process

1. **Analyze context** — What was the prompt? What did the agent (you) actually do? What was the final result?
2. **Update the resolved ws-changelog file** — Append a new entry using the template below. Create the file (and parent dirs) if it does not exist.
   - Done when: the resolved changelog path contains a new top entry with Prompt / Done / Result for this task.

## CHANGELOG.md Template

Insert the following exact format at the top of the file, directly under the main '# Changelog' header:

```markdown
### [YYYY-MM-DD HH:MM] Agent: {agent/runtime}
- **Prompt**: [Brief summarized intent of the user's request]
- **Done**: [What was actually implemented, changed, or fixed]
- **Result**: [Final outcome, status, or any immediate next steps]
```
