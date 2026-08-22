# Report shape — ws-spec-explain

Print these headings in order. Empty subsections allowed; mark gaps explicitly.

## Summary

| Field | Value |
|-------|-------|
| Target | slug / id / URL |
| Status | `not-started` \| `in-progress` \| `delivered` \| `blocked` \| `unknown` |
| Rationale | one line |
| Spec | path or gap |
| Plan dir | `{us-dir}` or gap |
| PR | number/url or gap |

## Status

| Label | When |
|-------|------|
| `not-started` | Spec exists; no `{us-dir}` / state, or state never left step 0 without product commits |
| `in-progress` | `status: active` / `paused`, or open PR not merged |
| `delivered` | `status: completed`, or PR merged, or `step-08-*.result.md` + merged evidence |
| `blocked` | `status: failed` / `cancelled`, or explicit blocker in state/result |
| `unknown` | Conflicting signals; list the conflict under Evidence |

## What it does

2–5 bullets from Description / plan intent. Quote ACs sparingly (ids + one line each, max 5; "N more on request").

## What it delivers / delivered

- **If not delivered:** intended outcomes (from ACs / result template).
- **If delivered:** what shipped (result.md, PR title, files_touched if present).

## Evidence

Bullet list of paths and SCM facts used. Include `Gaps:` for missing config, auth, or files.

## How to check (project / UI)

Concrete steps for a human in **this** repo: screens, routes, CLI, or config keys named by the spec/plan. If none are named → say so and point at acceptance criteria only.

## How to test

Prefer `config.json` → `verification.*` aliases from [`tools.md`](../../ws-shared/tools.md). Else name test files/commands found in the plan. Do not invent unconfigured commands.
