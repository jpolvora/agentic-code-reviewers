# Check-Harness — Report Format

> Sibling template for [`SKILL.md`](SKILL.md) § Output format. Load **on demand at Phase 6** (Step 2 — Plan) and at Phase 7 completion. Not needed for the scan phases.
>
> Always respond in **English (en-us)**. The **Step 2** report is delivered **before** any edit.

If the harness is healthy **and** there are no unrouted skills/rules pending decision, the short form (kept inline in `SKILL.md`) suffices:

> **Harness OK** — no broken links, material conflicts, absolute paths, or orphan artifacts without decision found in the audited scope. No corrections needed.

Otherwise — **correction plan** (mandatory before editing):

```markdown
## Harness Audit

**Date:** YYYY-MM-DD
**Mode:** [normal | dry-run] (execution — orthogonal to Install mode)
**Install mode:** [upstream | consumer]
**Skills scan root:** [.agents/skills | {skillsRoot} (+ global …)]
**Scope:** [full | files: ...]
**Files inspected:** N
**Path token map:** `{skillsRoot}=…` `{sharedDir}=…` `{plansDir}=…` `{reviewsDir}=…` (from config `pathTokens` / `plans.dir` / defaults)
**Status:** [awaiting approval to apply corrections | report only (dry-run)]

### Executive summary
- Problems found: X (Y critical, Z warning, W suggestion)
- Broken links: ...
- Absolute paths: ...
- Path-token notes: [healthy tokens expanded | token-in-link-target: N | undeclared ws-shared/ shorthand: N]
- Redundancies/conflicts: ...
- Unrouted skills/rules: ...
- Auto-load: N mandatory skills (~L lines), M conditional (~L lines)
- Detected overlaps: D domains with overlap (S duplicates, C complementary)
- Simulation alerts: ...

### Correction plan (ordered — apply only after approval)

| # | Severity | File | Problem (error) | Proposed correction |
|---|------------|---------|-----------------|-------------------|
| 1 | critical | `AGENTS.md:L28` | Link `.agents/skills/foo` nonexistent | Replace with `.agents/skills/ws-write-plan/SKILL.md` |
| 2 | warning | `AGENTS.md` | Skill `example` on disk without routing | Add line in § Skill loading table (see diff below) |

#### Details per item (when diff does not fit in table)

**#1 — `AGENTS.md`**
- **Error:** ...
- **Correction:** ...

### Skills and rules not routed in the resolved hub
| Type | Id / file | Path | Plan suggestion (#) |
|------|--------------|------|------------------------|
| skill | `example` | `.agents/skills/example/SKILL.md` | #2 |

### Routing and decision
- [ ] Optional host entry → AGENTS.md — [OK | absent (OK) | broken redirect]
- [ ] Progressive disclosure (AGENTS.md does not duplicate bodies) — [OK | inflation]
- [ ] Skill → skill relationships — [OK | gaps]
- [ ] Invocation triggers — [OK | absent]
- [ ] Skills/rules on disk vs resolved hub — [OK | unrouted: N]
- [ ] Orchestrator dependency closure vs `bin/skill-dependencies.json` — [OK | gaps: ...]
- [ ] `ws-spec-to-pr` dependency portability — [OK | parameterization deviations from config.json]

### Redundancies and conflicts
| Theme | Files | Type | Plan item (#) |
|------|----------|------|-------------------|
| Code review | `ws-code-review` (`us-code-review`) + `code-review` | name collision → resolved on port | — |

### Auto-load skills matrix (Phase 5c.1)
| Skill | Mandatory? | Lines | Output directives | Interacts with |
|-------|-------------|--------|---------------------|-------------|
| Guardrails skill | Yes | N | Engineering standards + code review proof | Surgical-scope, compression, learning |
| Response guidelines | Yes | N | accountability, anti-sycophancy, chain-of-verification | compression (tone) |
| Surgical-scope | Yes | N | surgical changes, no scope creep | guardrails skill |
| Compression skill | Yes | N | full prose compression | guidelines, guardrails |
| learning | Conditional | N | Learning: line in proof + MEMORY.md | guardrails, ws-changelog |
| ws-changelog | Conditional | N | CHANGELOG.md append | learning |
| UI patterns | Conditional | N | list/form patterns + standards docs | design docs |
| responsive design | Conditional | N | responsive/mobile-first | design docs |
| library docs | Conditional | N | resolve → query docs | — |

**Estimated total footprint:** Mandatory ~X lines (Y%), Conditional ~Z lines (W%), AGENTS.md + rules ~V lines (U%), **Total ~T lines**

#### Conflict matrix between mandatory auto-load skills
| Skill A | Skill B | Interaction | Status |
|---------|---------|-----------|--------|
| Guardrails skill | Surgical-scope skill | Engineering + surgical scope — complementary | none |
| Guardrails skill | Compression skill | Detailed proof vs compression — potential conflict | mitigated (precedence + compression § technical accuracy) |
| Guardrails skill | Response guidelines | Both define response tone | mitigated (precedence) |
| Surgical-scope skill | Compression skill | Surgical changes + compression — aligned | none |
| Response guidelines | Compression skill | Both modify response — tone vs size | mitigated (precedence) |
| Response guidelines | Surgical-scope skill | Accountability + scope — complementary | none |

#### Precedence verification
- [ ] AGENTS.md § Precedence is consistent with all auto-load skills
- [ ] No auto-load skill contradicts the declared hierarchy
- [ ] Documented opt-outs are recognized by all affected skills

### Overlapping skills, instruction duplication & composition topology (Phase 5c.2)
| Domain | Skills | Overlap / Composition type | Role Clarity | Recommendation |
|---------|--------|----------------------------|--------------|----------------|
| Code review | `ws-code-review` vs `ws-fable-judge` | composed — `ws-code-review` delegates adversarial audit to `ws-fable-judge` | ✅ Sharp | Keep composed relationship; avoid inline duplicate audit logic |
| Implementation | `ws-senior-developer` vs `ws-karpathy-guidelines` | complementary — macro delivery gate vs micro diff hygiene | ✅ Sharp | Distinct triggers; maintain scope vs diff boundary |
| PR workflow | `ws-fix-pr` vs `ws-goal-fix-pr` | composed — `ws-goal-fix-pr` wraps `ws-fix-pr` & `ws-goal-loop` | ✅ Sharp | Keep composition; `ws-goal-fix-pr` delegates single-pass fix to `ws-fix-pr` |
| Security | `ws-ship-pr` vs `ws-secrets-leak-review` | composed — `ws-ship-pr` invokes `ws-secrets-leak-review` pre-commit | ✅ Sharp | Maintain single security scanner primitive |
| Planning | `ws-write-plan` vs `ws-interview` | complementary — create plan vs audit plan | ✅ Sharp | Sequential pipeline steps; distinct triggers |
| Specs & Indexing | `ws-spec-format` vs `ws-write-spec` | composed — `ws-write-spec` outputs `ws-spec-format` schema | ✅ Sharp | Schema SoT cleanly separated from authoring step |

### Simulated context load (Phase 5c.3)

#### Loading tree (session start)
```
AGENTS.md
    ├── senior-developer (resolve via config / External Dependencies — optional)
    ├── ws-tdah/SKILL.md (auto)
    ├── ws-karpathy-guidelines/SKILL.md (auto)
    ├── optional rules from config.json.rules.* (when set)
    └── MEMORY.md (session start, before first implementation)
```

#### Session scenarios
    | Scenario | Extra skills | Estimated footprint |
    |---------|---------------|--------------------|
    | Session start (baseline) | — | ~T0 lines |
    | Backend task | + library docs skill (if new lib) | ~T0 + X lines |
    | UI CRUD task | + UI patterns + design docs | ~T0 + Y lines |
    | Full task (worst case) | all conditional + docs | ~T0 + Z lines |

#### Simulation alerts
- [ ] Circular load: [none detected | list cycles]
- [ ] Deep chain (>4 levels): [none | list]
- [ ] Orphan triggers: [none | list skills without entry point]
- [ ] Redundant reload: [none | list artifacts loaded 2+ times]
- [ ] Inconsistent opt-outs: [none | list]
- [ ] Rules conflicting with auto-load: [none | list]

### Skill improvements (optional — if ws-write-a-skill is installed)
*(Omit entire section if ws-write-a-skill is not installed or if no findings.)*

| Skill | Finding | Severity | Proposed correction | Plan item (#) |
|-------|--------|------------|-------------------|-------------------|
| (example) | obsolete reference | warning | replace with canonical source | #4 |

### Next step
Awaiting your approval to apply the plan. Reply `apply corrections`, `apply the plan`, or choose from `user-gate`.
```

After **Phase 7** (approved execution), add section:

```markdown
### Corrections applied
| # | Status | File | What was done |
|---|--------|---------|-----------------|
| 1 | applied | `AGENTS.md` | link corrected |
| 2 | skipped | — | user chose not to apply |

**Result:** Harness OK post-correction | pending: [list]
```

## Optional — persist report

If the user requests, save to:
`{plansDir}/harness-audit/harness-audit-{YYYYMMDD}.report.md` (default `{plansDir}` = `.agents/plans`)
