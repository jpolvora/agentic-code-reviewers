---
name: ws-pre-daily
version: 0.3.30
disable-model-invocation: true
description: Standup briefing of the last 36 hours — delivered, made, ongoing, next.
invocation_names:
  - pre-daily
  - ws-pre-daily
---

# ws-pre-daily

> When this skill is loaded, output "ws-pre-daily loaded."

Read-only standup for a rolling window (default **36 hours**). Prints **Delivered / Made / Ongoing / Next**. Does not commit, push, or post.

Timesheet clocks → [`ws-activity-report`](../ws-activity-report/SKILL.md). Output shape → [`references/OUTPUT.md`](references/OUTPUT.md).

## Invocation

```text
/pre-daily
/pre-daily --hours 24
/pre-daily --all-authors
/pre-daily --tz America/Manaus
```

| Arg | Rule |
|-----|------|
| `--hours` | Window length. Default **36**. |
| `--all-authors` | Include every commit author. Default: `git config user.email` then `user.name`. |
| `--tz` | Label only (collector stays UTC ISO). |

## Steps

1. **Resolve window** — Hours, author filter, `$PWD` git root. From `$PWD/.agents/skills/ws-shared/config.json` when present: `{plansDir}`, `{sharedDir}`, `{skillsRoot}`, changelog ← `rules.changelogFile` else `{sharedDir}/CHANGELOG.md`. Missing config → git-only, `{plansDir}`=`.agents/plans` if that dir exists, gap `config-missing`.
   - Done when: hours, author mode, and paths are fixed.

2. **Collect evidence** — Run (hybrid path: `{skillsRoot}` then `{globalSkillsRoot}`):

   ```bash
   python {skillsRoot}/ws-pre-daily/scripts/collect_window.py --hours {hours} --repo {gitRoot} --plans-dir {plansDir} --changelog {changelogPath}
   ```

   Add `--all-authors` when requested, and optional `--tz {tz}`. Script exit 0 + `ok: true` required. Empty lists are valid.
   - Done when: JSON with `window`, `git`, `plans`, `changelog`, `gaps` is in context.

3. **Enrich SCM (optional)** — If `providers.scm` is set, load that provider and list PRs/WIs **updated inside the window**. Auth failure → gap `scm-skipped`. Skip this step when config is missing.
   - Done when: SCM items are attached or a gap is recorded.

4. **Classify & emit** — Apply OUTPUT classification. Invent nothing. Stop after printing.
   - Done when: standup with all six headings is printed (empty sections allowed).
