# §9 Post-workflow follow-up — Template reference

Use when appending to `step-01-{slug}.plan.md` under `{plansDir}/{slug}/`. Replace placeholders; keep tables sortable by `finding-id` / step id.

Plans typically use sections **0–8** from [`ws-write-plan`](../ws-write-plan/SKILL.md). §9 is appended **after** existing content.

---

## Minimal example (slug `job-run-observability`)

```markdown
## §9 Post-workflow follow-up

**session-id:** `post-20260710120000`
**triggered:** 2026-07-10
**after-workflow:** `job-run-observability-20260709T211800Z`
**branch:** `develop`
**intake-source:** manual QA

### Findings

| ID | Severity | Description | Expected | Status |
|----|----------|-------------|----------|--------|
| F-01 | should-fix | Stale badge missing on schedule list | AC4: `lastRun.isStale` reflected in UI | done |

### Delta implementation steps

| Step | Finding | Action | Files (expected) | AC / test | Status |
|------|---------|--------|------------------|-----------|--------|
| S-01 | F-01 | Wire `isStale` into `JobStatusBadge` on list row | `web/src/pages/platform/PlatformJobsListView.tsx` | Browser smoke `/platform/jobs` | done |

### Commits (this session)

| Hash | Message | Steps |
|------|---------|-------|
| `a1b2c3d` | fix(job-run-observability): stale badge on schedule list | S-01 |
| `e4f5g6h` | docs(job-run-observability): post-workflow follow-up plan and result | — |

### Certification

| Check | Status |
|-------|--------|
| Build | pass |
| Tests (scoped) | pass — Vitest + integration |
| Plan ↔ code | pass |
| step-08-result.md updated | done |
```

---

## step-08-result.md patch pattern

Update `step-08-{slug}.result.md` sections **Done** and **Next steps**:

**Done** — append bullets:

```markdown
- **Post-workflow:** Stale badge on schedule list (`a1b2c3d`).
```

**Next steps** — remove resolved manual items; keep PR push if still pending:

```markdown
## Next steps

- Open PR `develop` → `master` when ready.
```

If stub `step-08-{slug}.result.md` did not exist, create full file per [`protocols/delivery-result.md`](../ws-spec-to-pr/protocols/delivery-result.md).

---

## GitHub issue slug example (`us-2517`)

Commit messages may use `fix(us-2517): …` when `{slug}` is `us-2517`; folder remains `{plansDir}/us-2517/step-01-us-2517.plan.md`.
