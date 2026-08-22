# pre-daily output

Load when emitting the standup. Language: session language (`AGENTS.md` / user). Headings below are stable keys; translate labels, not evidence.

Clip lists to **5 items** per section, then `{N} more on request`.

```markdown
## Window
{hours}h · {sinceIso} → {untilIso} · author={authorFilter|all} · base={baseBranch}

## Delivered
- {id-or-short} — {one line what shipped} (`{short}` / PR {n} / plan step)

## Made
- {one line of work in the window that is not yet on base}

## Ongoing
- {slug-or-branch} — step {n} / dirty / open PR {n}

## Next
- {next concrete action derived from Ongoing only}

## Gaps
- {scm-skipped | plans-dir-missing | changelog-missing | …}
```

## Classification

| Bucket | Evidence in the collector JSON |
|--------|--------------------------------|
| **Delivered** | `git.commits[]` with `onBase: true`; changelog entries whose **Done/Result** names a ship; plans whose `currentStep` is terminal (`8`/`9`/`10` or completed) |
| **Made** | `git.commits[]` with `onBase: false`; changelog / plan updates that are progress, not terminal |
| **Ongoing** | `git.dirty`; current branch ≠ base with unpushed/unmerged commits; plans whose `currentStep` is not terminal |
| **Next** | Only from Ongoing: next incomplete plan step, or first dirty concern. Empty when Ongoing is empty |

Positive enclosure: every bullet cites a hash, path, step, or changelog heading from the JSON (or from the SCM enrich step). No clocks (that is `ws-activity-report`).
