# Project Specification Index (`index.PRD`)

Standard progressive-disclosure spec index scaffold.

```markdown
# [Project Name] — Specification Index

## 1. How to use

- **Index (this file):** High-level roadmap, phase feature map, next specs, done log, archive.
- **Detail specs (`*.spec.md`):** Deep requirements and acceptance criteria in `{specsDir}/`.

## 2. Status legend

| Mark | Meaning |
|------|---------|
| `[ ]` | todo |
| `[~]` | partial |
| `[x]` | done |
| `Verified: ...` | optional host smoke — **never auto-written by sync** |

## 3. Goal

Primary product or system goal description.

## 4. Problems

Key problem statements addressed by this project.

## 5. Primary use cases

- UC1: Key user interaction or capability.

## 6. Constraints & non-goals

- Out of scope items and architectural boundaries.

## 7. Feature map by phase

### Phase 1: Core Foundation
- [ ] Feature A (`spec: 01-feature-a.spec.md`)
- [ ] Feature B (`spec: 02-feature-b.spec.md`)

### Phase 2: Enhancements
- [ ] Feature C (`spec: 03-feature-c.spec.md`)

## 8. Next specs

| # | Spec | Status | Target Phase | Notes |
|---|------|--------|--------------|-------|
| 1 | `01-feature-a` | `[ ]` todo | Phase 1 | Core entry point |
| 2 | `02-feature-b` | `[ ]` todo | Phase 1 | Dependency |

## 9. Inbox (unscheduled ideas)

- Unscreened idea 1
- Unscreened idea 2

## 10. Done log

| Date | Slug | Title | PR / Commit |
|------|------|-------|-------------|

## Archive

Durable delivery records harvested from `{plansDir}` so plan folders can be removed without losing history.

| Slug | Outcome | Last state | PR / Commit | Summary |
|------|---------|------------|-------------|---------|

## 11. Maintenance checklist

- [ ] All completed features logged in Done log.
- [ ] Linked `*.spec.md` files exist for active Next specs.

## 12. Related docs

- [`README.md`](../../../README.md)
- [`AGENTS.md`](../../../AGENTS.md)
```
