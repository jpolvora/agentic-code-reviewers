---
name: ws-self-learning
version: 0.3.30
description: Anti-regression memory engine — consults shared MEMORY before planning/coding and records newly discovered traps into the project knowledge hub.
invocation_names:
  - self-learning
  - ws-self-learning
---

# Self-Learning

> When this skill is loaded, output "ws-self-learning loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

**Bidirectional gate** — MEMORY is both input (avoid known traps) and output (record new ones).

Expand path tokens first ([`tools.md`](../ws-shared/tools.md) § Path tokens): `{sharedDir}` → `.agents/skills/ws-shared`, `{skillsRoot}` → `.agents/skills`.

Consumer-owned memory lives in the shared hub (never overwritten by install/update):

- Entries: `{sharedDir}/memory/YYYY-MM-DD-[slug].md`
- Compiled index: `{sharedDir}/MEMORY.md`

## When to run

| Moment | Action |
|--------|--------|
| **Before plan / before code / before fix** | **Consult:** `Grep` / `Read` `{sharedDir}/MEMORY.md` for task keywords AND query touched paths with `node {skillsRoot}/ws-self-learning/scripts/self_learning.cjs --match-paths <files>`. Apply matching **DO NOT** and **INSTEAD DO** directives. |
| Implementation hit a trap/pitfall/race | **Write:** new file in `{sharedDir}/memory/`, then `node {skillsRoot}/ws-self-learning/scripts/self_learning.cjs --compile` (expand tokens before shell) |
| Session had $\ge 2$ tool/test/build failures | **Write (Mandatory):** Failure Reflection Hook — record Root Cause & Trap in `{sharedDir}/memory/`; `Learning: N/A` is strictly forbidden |
| `ws-fable-judge` audit yields `REFUTED` / `CAVEATS` | **Write (Mandatory):** Adversarial Reflection — record `Severity: High` or `Critical` trap explaining why claims diverged from ground truth |
| Standard feature/bug fix, no new trap & $<2$ failures | Proof line: `Learning: N/A (standard implementation)` after confirming no new pitfall and session friction $<2$ |
| Pure Q&A, no durable insight | Proof line: `Learning: N/A (no new project knowledge)` |

Task is **not done** until the completion side runs (write or valid `Learning: N/A`) and proof includes a **`Learning:`** line. Prefer consulting MEMORY **before** inventing a new approach when the domain already has High/Critical entries.

## Pre-work consult (mandatory for mutating work)

1. Identify 3–8 keywords and touched file paths from the task (e.g. `bash`, `CRLF`, `launcher`, `verify.sh`, `managed skill`, `encoding`, touched files like `src/Controllers/Auth.cs` or `bin/cli.js`).
2. Query matching memories:
   - Keyword grep: `Grep` terms in `{sharedDir}/MEMORY.md` or `node {skillsRoot}/ws-self-learning/scripts/self_learning.cjs --query <keyword>`.
   - File/path matching: `node {skillsRoot}/ws-self-learning/scripts/self_learning.cjs --match-paths <touched_files...>`.
3. If a hit is Severity Medium+, fold its **DO NOT** / **INSTEAD DO** directives into the plan or first edit. Do not re-discover the same failure mode.
4. For scripts/skills specifically, also apply the preflight in memory entry **Script/skill authoring preflight** (launchers, LF, Windows Python `\r\n`, no shell bridges).

## Failure Reflection Hook (Kill the "Learning: N/A" Escape Hatch)

Agents often attempt to save turn tokens by defaulting to `Learning: N/A`. To ensure continuous learning:
- If `dotnet build`, `npm test`, linters, or any verification command/tool failed $\ge 2$ times during the session before succeeding, the session experienced non-trivial friction.
- In this scenario, **`Learning: N/A` is strictly FORBIDDEN**.
- You MUST analyze the root cause of the friction (e.g., misconfigured path, missing flag, unexpected type error, stale cache) and write a new `{sharedDir}/memory/YYYY-MM-DD-[slug].md` entry with concrete **DO NOT** and **INSTEAD DO** directives.

## Adversarial Reflection Trigger (`ws-fable-judge`)

When [`ws-fable-judge`](../ws-fable-judge/SKILL.md) audits work and returns a verdict of **`REFUTED`** or **`VERIFIED WITH CAVEATS`** (due to weakened assertions, false completion, scope creep, or unauthorized actions):
1. Create a mandatory reflection entry in `{sharedDir}/memory/YYYY-MM-DD-fable-[slug].md`.
2. Set `Severity: High` (for caveats/scope creep) or `Severity: Critical` (for refuted fraud/regressions).
3. Document the precise mechanism of divergence in **DO NOT** and the verified invariant in **INSTEAD DO**.

## Process (write after)

1. **Analyze context** — What did we try that failed? What non-obvious constraint or pitfall did we hit?
2. **Write to `{sharedDir}/memory/`** — New file `{sharedDir}/memory/YYYY-MM-DD-[slug].md`. **ONLY** traps/pitfalls. **DO NOT** use as a ws-changelog or to record patterns an LLM already knows.
3. **Compile `MEMORY.md`** — Expand tokens, then run:
   ```bash
   node {skillsRoot}/ws-self-learning/scripts/self_learning.cjs --compile
   ```
4. **Proof + chat** — Set `**Learning:** [entry title]` or `N/A` (only when valid per rules above) in the final proof; one-line summary in the reply.

## Conflict Resolution

If `MEMORY.md` merge-conflicts on pull/merge, **do not** resolve by hand. Run:
```bash
node {skillsRoot}/ws-self-learning/scripts/self_learning.cjs --compile
```
This rebuilds a clean index from `{sharedDir}/memory/` (per-file entries do not conflict).

## Individual Memory File Template

```markdown
### [YYYY-MM-DD] [Topic/Component]
- **Layer**: [e.g. Core, Infrastructure, Api, Web, Tests, or N/A]
- **Module**: [e.g. Auth, Wallet, Users, or N/A]
- **Severity**: [Low, Medium, High, Critical]
- **PathPattern**: [e.g. src/Api/Controllers/*, *.cs, scripts/*.py, or N/A]
- **Scenario / Context**: [When implementing X, dealing with Y, or configuring Z]
- **DO NOT**: [What specific pattern, assumption, or approach to avoid and why it fails]
- **INSTEAD DO**: [What specific correct implementation pattern or action to use instead]
```

Path tokens: [`tools.md`](../ws-shared/tools.md) § Path tokens.

## Done when

- Pre-work: Grep/path-match notes recorded or none found.
- Completion: new `{sharedDir}/memory/*.md` compiled via script exit 0, or valid `Learning: N/A` proof line (permitted only when session friction $<2$ failures).

## Subagent contract

- Query MEMORY keywords and assigned file paths before planning or editing.
- Inject matching DO NOT and INSTEAD DO guidance into the implementation context.
- Record a new durable trap only when evidence is novel and reusable.
- After two or more tool, build, or test failures, a failure-reflection memory entry is mandatory.
- Return `memory_consult` and a valid `Learning:` result.

