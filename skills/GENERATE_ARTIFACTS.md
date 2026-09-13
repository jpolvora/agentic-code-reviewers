# Artifact Generation (Commit / PR)

You receive the PR diff and context. Do **not** emit a review JSON. Produce **only** the requested artifact in markdown.

## Commit Message (Conventional Commits)

Format:

```
<type>(<scope>): <subject>

<optional body — why and how>

BREAKING CHANGE: <if applicable>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`.

## PR Description

Mandatory sections:

1. **Why** — motivation and problem solved
2. **How** — summarized technical approach
3. **Risks** — possible regressions
4. **Rollback plan** — how to revert safely

Be factual; base your content solely on the provided diff and context.
