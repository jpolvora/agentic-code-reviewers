# Canonical `*.spec.md` format

Referenced by [`SKILL.md`](SKILL.md). Other skills link here — do not duplicate.

## File name

| Source | Pattern |
|--------|---------|
| Spec of record — any origin (tracker fetch, `ws-write-spec`, hand-written) | `{specsDir}/{slug}.spec.md` |
| Workflow copy (after `ws-local-spec-provider` register) | `{plansDir}/{slug}/step-00-{slug}.spec.md` |

Slug: `us-{id}` for tracker ids; else basename without `.spec.md` (strip optional `step-00-`). Order is fixed: the `{specsDir}` spec of record is written **first**, then the `{plansDir}` workflow copy. Standalone `/write-spec` writes **only** the `{specsDir}` path — never creates `{plansDir}` artifacts.

## YAML frontmatter (required)

```yaml
---
id: 1474              # integer — tracker id; null if local
slug: us-1474
title: "Feature title"
source: github        # github | azure-devops | local
issueState: open      # optional
issueUrl: "https://github.com/{org}/{repo}/issues/1474"  # optional
workItemType: "User Story"  # optional — ADO
specDate: 2026-07-02
---
```

## Body (required sections)

```markdown
# Specification — {title}

## Description

(agentic technical scope, background, and system boundaries)

## Acceptance Criteria

- AC1: (unambiguous, deterministic, testable criterion)
- AC2: (clear pass/fail condition with edge cases)

## Original Issue Context

(optional / required for tracker issues — verbatim original human-authored issue description, comments, and audit context for human reading and traceability)

### Prior Work Sweep

(required when `source` is `github` or `azure-devops`; optional for `local` — record keyword/git findings when run)

- Related PRs, commits, and duplicate-risk notes from provider `sweep-prior-work` or local keyword/git sweep.

### Design Intent

(optional — required for modification / bugfix tasks after `git log -p -S` or `git log -L`; skip greenfield with reason)

## Child Tasks

(optional — when tracker had sub-tasks)

### Task #{id} — {title}

- **Status:** …
- **Description:** …

## Notes

(technical considerations, dependencies, constraints)
```

## Validation

1. ACs enumerable, deterministic, and testable — one line per AC (`- AC{N}: ...`).
2. `source: local` → author drafts complete ACs from free-text requirements.
3. `source: github` | `source: azure-devops` → `ws-write-spec` reformulates and enhances raw issue into agentic ACs while preserving human text in `## Original Issue Context`; **`### Prior Work Sweep` required** after sweep before plan/code.
4. Modification / bugfix specs → `### Design Intent` required (or documented skip for greenfield).
5. `*.issue.json` is audit-only — downstream workflow skills read `step-00-*.spec.md` only.
6. Local specs (`ws-write-spec` / hand-written) live under `{specsDir}` (`plans.specsDir`, default `.agents/specs`); orch registers to canonical `step-00` under `{plansDir}` when a workflow starts.

