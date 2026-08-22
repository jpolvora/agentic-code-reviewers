# Spec-to-PR — Diagrams (FSM 0–9)

> **Architecture:** Steps 0–9. Pipeline skills live under `.agents/skills/ws-*` (`ws-write-spec`…`ws-fix-pr`, `ws-goal-fix-pr`, `ws-update-plan-implementation`; folder == `name:`). Dual-mode with [`ws-spec-to-pr-lite`](../ws-spec-to-pr-lite/SKILL.md) (lite steps 0–5). Canonical artifacts: [`ARTIFACTS.md`](ARTIFACTS.md). Gates/config: [`gates.md`](../ws-shared/gates.md), [`config-resolution.md`](../ws-shared/config-resolution.md). Agent contract: [`SKILL.md`](SKILL.md).

---

## 0. Phases (standard)

```mermaid
flowchart LR
  F0[F0 Bootstrap<br/>step 0] --> F1[F1 Planning<br/>steps 1–3]
  F1 --> F2[F2 Implement<br/>step 4]
  F2 --> F3[F3 Check<br/>step 5 then G2-code]
  F3 --> F4[F4 Review<br/>step 6 fix→re-review then G2-code]
  F4 --> F5[F5 Testing<br/>step 7]
  F5 --> F6[F6 Ship + Fix-PR<br/>steps 8–9]
```

Lite: F0=0 · F1=1 · F2=2 then G2-code · F3=3 then G2-code (fixes if any) · F4=4 · F5=5 (no Testing / interview / DAG / check).

---

## 1. Standard pipeline (steps 0–9)

```mermaid
flowchart TD
  S0[0 Spec] --> S1[1 Plan]
  S1 --> S2[2 Interview]
  S2 --> S3[3 Plan-to-tasks]
  S3 --> S4[4 Implement]
  S4 --> S5[5 Check-implementation]
  S5 -->|score ≥ 9| C1[G2-code verified implementation]
  S5 -->|score < 9| G5[scoreAndRefine until ≥ 9]
  G5 -->|score ≥ 9| C1
  G5 -->|max 3 still < 9| P[Pause]
  C1 --> S6[6 Code-review]
  S6 -->|findings| Fix[Fix substep<br/>ws-implement-tasks]
  Fix --> C2[G2-code review fixes]
  C2 --> S7[7 Testing]
  S6 -->|clean| S7
  S7 --> S8[8 Ship<br/>delivery + push/PR]
  S8 --> S9[9 Fix-PR]
```

---

## 2. Lite pipeline (steps 0–5)

```mermaid
flowchart TD
  L0[0 Spec — same entry as standard] --> L1[1 Plan]
  L1 --> L2[2 Implement]
  L2 --> C1[G2-code implementation]
  C1 --> L3[3 Review fix→re-review]
  L3 -->|fixes| C2[G2-code review fixes]
  C2 --> L4[4 Ship]
  L3 -->|clean| L4
  L4 --> L5[5 Fix-PR]
```

---

## 3. Skill folder map (filesystem)

| Step (standard) | Skill `name:` | Folder |
|-----------------|---------------|--------|
| 0 | `ws-write-spec` | `ws-write-spec` |
| 1 | `ws-write-plan` | `ws-write-plan` |
| 2 | `ws-interview` | `ws-interview` |
| 3 | `ws-plan-to-tasks` | `ws-plan-to-tasks` |
| 4 / 6-fix | `ws-implement-tasks` | `ws-implement-tasks` |
| 5 | `ws-verify-plan` | `ws-verify-plan` |
| 6 | `ws-code-review` | `ws-code-review` |
| 7 | `ws-testing` | `ws-testing` |
| 8 | `ws-ship-pr` | `ws-ship-pr` |
| 9 | `ws-fix-pr` / `ws-goal-fix-pr` | `ws-fix-pr` / `ws-goal-fix-pr` |
| Post | `ws-update-plan-implementation` | `ws-update-plan-implementation` |

---

## 4. Dispatch cycle (per step)

```mermaid
flowchart LR
  Gate[Post-step gate] --> Advance[Next / Advance]
  Advance --> Context[Bounded contract + indexed plan slices]
  Context --> Disp[dispatch-agent / inline]
  Disp --> Ingest[Validate step-output + AC evidence]
  Ingest --> State[Atomic Node state update]
  State --> Derived[run.json + run.md + plans index + telemetry]
  Derived --> Gate
```

Step 5 derives its score from `ac-ledger.json`. Review rounds remain immutable, and optional parallel verify/review uses one pinned product commit before deterministic finding merge.

Universal controls ([`gates.md`](../ws-shared/gates.md)): **Next**, **Previous**, **Replay**, **Refine→Replay**, **Commit**, **Undo**.

---

## 5. Step 7 — Testing

```mermaid
flowchart TD
  Start[Step 7] --> Skip{skipTesting / no test surface?}
  Skip -->|yes| Ship[Advance Step 8]
  Skip -->|no| Plan[testing.plan.md]
  Plan --> Run[Unit + integration/E2E + coverage + feature quality]
  Run --> MutSkip{mutation configured and not skipMutationTesting?}
  MutSkip -->|no| Report["testing.report.md Mutation skipped|passed|failed"]
  MutSkip -->|yes| Mut[Run verification.mutationTest]
  Mut --> MutGate{score >= threshold?}
  MutGate -->|yes| Report
  MutGate -->|no| ReportFail["testing.report.md Mutation failed"]
  ReportFail --> Fix[ws-implement-tasks fix mode]
  Fix -->|revalidate max 3| Plan
  Report --> Ship
```

Artifacts: `step-07-{slug}.testing.plan.md`, `step-07-{slug}.testing.report.md` (always write; Mutation `passed` \| `failed` \| `skipped`). Mutation fail → report then fail-closed fix/revalidate (no Advance until passed or skipped).

---

## 6. Ship + Fix-PR split

```mermaid
flowchart LR
  S8[Step 8 Ship] -->|create PR| PR[prUrl / prId]
  PR --> S9[Step 9 Fix-PR]
  S9 --> Loop[ws-goal-fix-pr or ws-fix-pr]
  Loop --> Merge[Merge policy]
```

`ws-ship-pr` with `stopBeforeFixPr: true` in orch mode — no goal-fix loop inside ship.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| Dispatch | Subagent via `dispatch-agent` (host-provided) |
| Inline | Same session (lite) |
| Gate | user-gate / markdown fallback |

## Triggers

`/ws-spec-to-pr`.
