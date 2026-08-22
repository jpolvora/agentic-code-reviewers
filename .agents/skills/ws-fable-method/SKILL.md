---
name: ws-fable-method
description: 7-step structured problem-solving methodology — evidence-based problem classification, primary-source investigation, surgical action, and adversarial verification for complex tasks.
version: 0.3.30
invocation_names:
  - ws-fable-method
  - /ws-fable-method
  - fable-method
  - /fable-method
---

# Fable Method (`ws-fable-method`)

> When this skill is loaded, output "ws-fable-method loaded."

Structured problem-solving loop: accuracy via structure, evidence, honesty. Follow literally; do **not** print step headers to the user unless asked. en-us; paths via `{plansDir}` / `{sharedDir}` / `{skillsRoot}` + `config.json`.

## Subcommands

```
/ws-fable-method <task>       Full 7-step loop (default)
/ws-fable-method plan <task>  Steps 0–3 only → plan → STOP for approval
/ws-fable-method audit        Audit via ws-fable-judge
/ws-fable-method report       Outcome-first report with caveats
```

## Gates (before the loop)

**Orch / senior plan already active** — If `ws-spec-to-pr` / `ws-spec-to-pr-lite` / `ws-multi-spec` owns the session, do **not** add a competing Plan-First STOP or parallel plan ceremony; orch steps win. If `ws-senior-developer` already confirmed a plan for this task, skip fable Step 0 Plan-First and use Evidence→Act→Verify only when investigation structure helps (or skip the loop). Code review proof checklist stays owned by `ws-senior-developer` (fable Verify does not replace it).

**Triviality** — all must hold: 1 file · <10 lines · no new behavior/architecture · solution known without search. If trivial: change → one verify → 1–2 sentence report. Else: full loop.

**Fit** — where is ground truth?
- Reachable sources → full loop
- Unlearned technique → Step 2 lookup budget first, then loop
- Inference only → say so; low-confidence; do not dress as rigorous
- Recurring domain → `ws-fable-domain` adapter

## Loop

```
ask → 0 Classify → 1 Done → 2 Evidence → 3 Decide → 4 Act → 5 Verify → 6 Report
```

| Step | Done when |
|------|-----------|
| **0 Classify** | Shape picked: **Question** (findings + 1 rec, no edits) · **Task** (verified change) · **Plan-First** (plan + named verifications, **STOP**). Tie-break: plan-first beats task; unsure → plan-first. |
| **1 Define Done** | 1–2 sentences + named check before work (test/build/log cite; or plan artifact). |
| **2 Evidence** | Orient (glob) → primary sources → parallel independent lookups → narrow search; max **2** lookup rounds then state gaps. |
| **3 Decide** | One primary recommendation + surgical blast radius. |
| **4 Act** | Surgical edits only; stop after 3 failed verify retries. |
| **5 Verify** | Observed re-run / diff; `git diff` matches scope. |
| **6 Report** | Outcome first → evidence → honest caveats. |
