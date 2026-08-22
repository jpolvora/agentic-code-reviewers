# Prepare to PR — goal checklist

**Mandatory** before commit/push/create-PR. Agent **drives**; show board after each item and before shipping. Success: every required row ✅ or justified ⏭. Any ❌ → STOP (no push/PR).

## Board (print to user)

```markdown
### Prepare to PR
| # | Check | Status | Evidence |
|---|-------|--------|----------|
| 1 | Test coverage for modified code | ✅ / ❌ / ⏭ | … |
| 2 | Build (consumer verification) | ✅ / ❌ / ⏭ | … |
| 3 | Tests run | ✅ / ❌ / ⏭ | … |
| 4 | Security / leak scan | ✅ / ❌ / ⏭ | … |
| 5 | Fable-judge audit verdict | ✅ / ❌ / ⏭ | … |
| 6 | Consumer prepare / before-push steps | ✅ / ❌ / ⏭ | … |
| 7 | Board shown; ready to ship | ✅ / ❌ | … |
```

✅ = done/credited · ❌ = failed · ⏭ = N/A or proven earlier with evidence for the **current** tree.

## Consumer rules (always enforce)

Resolve from the **consumer project** only — never invent stack commands:

| Source | Use for |
|--------|---------|
| `config.json` → `verification.*` | Build / test / format |
| `config.json` → `rules.*` + [`ws-shared/AGENTS.md` External dependencies](../ws-shared/AGENTS.md#external-dependencies) | Guardrails / optional rule paths (or root `AGENTS.md#external-dependencies` when authoring upstream) |
| `STACK.md` (`rules.stackFile`, default `{sharedDir}/STACK.md`) | Ship/verify notes |
| Consumer hubs + ship docs (see §6 scan list) | Prepare / before-push / before-publish steps |
| Session evidence | Orch Steps 6–7 — credit only if tree unchanged |

Prefer `bash .agents/skills/ws-ship-pr/scripts/verify.sh` when it covers configured build+test; else `verification.*` via [`tools.md`](../ws-shared/tools.md) (run config strings unchanged). Expand path tokens before Read/Grep/Shell ([`tools.md`](../ws-shared/tools.md) § Path tokens).

## Checklist items

### 1. Test coverage for modified code
**When:** non-doc/non-config code change vs `baseBranch` (or uncommitted ship-scope diff).  
**Do:** map changed files → tests; in-scope gaps → ❌ + hand off to implement/fix.  
**⏭:** no code modified, or coverage proven this session with evidence.  
**Done when:** coverage assessed; gaps listed or none.

### 2. Build
**When:** no green build yet for the current tree.  
**Do:** `verification.backendBuild` (+ `frontendBuild` if frontend touched), or `bash .agents/skills/ws-ship-pr/scripts/verify.sh` build portion.  
**⏭:** green build evidence for current tree.  
**Done when:** build green or ❌ with summarized output.

### 3. Tests
**When:** no green tests yet for the current tree.  
**Do:** `verification.backendTest` (+ `frontendTest` if frontend touched), or full `bash .agents/skills/ws-ship-pr/scripts/verify.sh`.  
**Upstream `workflow-skills`:** `verify.sh` also runs `node bin/generate-skill-integrity.js --check` when that script exists. Testing / ship approval requires it green; if red → `npm run generate-integrity`, commit `bin/skill-integrity.json`, re-run (see root `AGENTS.md` § Upstream skill integrity regenerate when authoring against the source repo).  
**⏭:** green evidence, or `skipTests` / orch `skipTesting` with waiver on board.  
**Done when:** tests green (including integrity `--check` when applicable), waived with evidence, or ❌.

### 4. Security / leak scan
**When:** no security check yet on ship-scope diff (or full tree if scope unclear).  
**Do:** run [ws-secrets-leak-review](../ws-secrets-leak-review/SKILL.md); HIGH → ❌. Honor `config.json.rules.*` security paths when set.  
**⏭:** clean scan evidence for current ship-scope tree.  
**Done when:** scan clean, or HIGH findings listed and push blocked.

### 5. Fable-judge audit verdict

**When:** always show on the board before commit/push/create-PR.  
**Do:** read the latest [`ws-fable-judge`](../ws-fable-judge/SKILL.md) verdict for the **current** ship-scope tree (orch Steps 5/6 reports, review artifacts, or a fresh run when no verdict exists).  
**Status mapping:** `VERIFIED` or `VERIFIED WITH CAVEATS` → ✅ · `REFUTED` → ❌ and **STOP** (no push/PR).  
**⏭:** `config.json` → `fable.enabled` is `false`, or `autoAudit` is `false`, or no fable run applies to the current tree — cite config + evidence. Prior orch fable runs still **show** this row; credit ⏭ only when the verdict (or N/A reason) matches the **current** tree.  
**Note:** Step 1 preflight in [`ws-ship-pr`](SKILL.md) still enforces `fable.enabled` + `autoAudit` + `auditVerdictsBlockShip`; this row is **visibility only** — do not weaken that gate.  
**Done when:** verdict shown on board with ✅, ❌, or justified ⏭.

### 6. Consumer prepare / before-push steps (discover + wait)

**When:** always, before commit/push/create-PR.  
**Gate:** do **not** proceed to ship-pr Steps 4–5 until this row is ✅ or justified ⏭. Discovered steps are **blocking** unless the cited section marks them optional.

#### Discover (mandatory scan)

1. **Build the scan set** (skip missing paths; do not invent host-private folders):
   - Repo-root `AGENTS.md` (consumer or upstream local hub)
   - `{sharedDir}/AGENTS.md`
   - Every existing path listed under `config.json` → `rules.*`
   - `rules.stackFile` / `STACK.md`
   - `CONTRIBUTING.md`, `RELEASE.md`, `PUBLISH.md` at repo root when present
   - Any other **consumer-owned** markdown the hubs above link as ship/release/prepare guidance
2. **Grep / Read** those files for sections whose headings or lead-in match (case-insensitive), including near-synonyms:
   - `prepare`, `prepare-to-ship`, `prepare to PR`, `prepare to ship`
   - `before push`, `before publish`, `before deliver`, `before delivery`, `before shipping`, `before merge`
   - `ship`, `release`, `publish`, `deliver` when the section lists **agent obligations** before push/PR
   - `local project rule` / `local harness` when tied to shipping or PR creation
   - `skill integrity` / `generate-integrity` / `verify-integrity` / `skill-integrity.json` when the hub requires regenerating digests before push/PR
3. **List hits** in board evidence for row 6 (file + heading + one-line obligation). Zero hits → ⏭ with `no prepare/before-push steps found in scanned sources` and list what was scanned.

#### Wait / execute

1. For each discovered required step: run it (or credit with evidence for the **current** tree).
2. Re-show the board after the set completes. Incomplete or failed → ❌ and **STOP** (no commit/push/PR).
3. Do not re-ask the user to invent steps; only enforce what local hubs/rules already document.

**Done when:** all discovered required steps ✅, or ⏭ with scan evidence.

### 7. Show board & gate
Print full board. Commit/push/PR **only** if required rows ✅/⏭ and SCM resolves (`providers.scm` per [config-resolution.md](../ws-shared/config-resolution.md)). Unresolved SCM or `shipAction: skip` → stop after board.  
**Done when:** user saw board; ship gate decision explicit.

## Rationalizations

| Excuse | Reality |
|--------|---------|
| "Orch tested — skip board" | Show board; credit with ⏭ + evidence. |
| "Docs-only — skip security" | Scan ship-scope; ⏭ only if no secret-bearing paths. |
| "CI will build/test" | Local build/tests required unless waived on board. |
| "No SCM — invent gh" | STOP; resolve `providers.scm` or skip ship. |
| "No consumer prepare — skip scan" | Always scan hubs/rules; ⏭ only after an empty scan with sources listed. |
| "Local AGENTS bump/rule is optional" | If discovery found a before-push/ship obligation, it blocks until done. |
| "Fable already ran in orch — skip board" | Show row 5; credit ⏭ only with current-tree verdict or N/A evidence. |
