# Skill Authoring & Protocol Guidelines

**Audience: Agents and Skill Authors**  
**Mandatory Contract:** Mandatory guidelines for designing, authoring, pruning, and maintaining lean, deterministic, and token-efficient agent skills in this repository.

> **Canonical Source of Truth (`.agents/skills/`):** `.agents/skills/ws-*` is the **only canonical source of truth** for all skills in this upstream package. Whenever creating, reviewing, updating, or enhancing skills (`ws-*`), agents **MUST edit files under `.agents/skills/`**. The installation source shipped by the installer is always `.agents/skills/`.

---

## 1. Core Philosophy: Meta-Instruction & Architecture

Authoring agent skills is **meta-instruction and protocol design**, not application software development. It belongs to the **Planning & Review** phases (Architecture, Trade-offs, Progressive Disclosure, Context Budget Optimization) rather than pure code execution.

| Dimension | Execution (Step 4) | Skill Authoring (Protocol Design) |
|-----------|--------------------|-----------------------------------|
| **Goal** | Solves immediate codebase task | Constrains agent search space & behavior deterministically |
| **Output** | Application code & tests | State machines, gates, verifiable exit criteria, & minimal prompts |
| **Optimization** | Runtime performance / correctness | Context window token economy & cognitive load minimization |

---

## 2. Model Selection & Role Mapping

When designing or revising skills, select LLM architectures according to their cognitive strengths. In `config.json`, skill authoring maps to `plannerModel` and `reviewerModel` — not `executionModel`.

### Recommended 2-Pass Workflow

1. **Pass 1 (Planner / Architect):**
   - **Model:** High-reasoning / thinking models (e.g., Claude Sonnet thinking or Opus thinking).
   - **Role:** Define overall structure, state machine steps, verifiable "Done when" conditions, invocation triggers, and entry gates. Follows long authoring protocols (`ws-write-a-skill`) and balances context load vs. cognitive load.
2. **Pass 2 (Reviewer / Auditor):**
   - **Model:** High-reasoning model executing a dedicated **pruning checklist**.
   - **Role:** Detect no-ops, eliminate sediment, audit loose criteria, remove duplicate instructions, and enforce progressive disclosure limits.
3. **Minor Tweaks & Wording Corrections:**
   - **Model:** Fast models (e.g., Composer fast or Gemini Flash).
   - **Role:** Typos, step renames, formatting adjustments, or localized single-line edits. Avoid fast models for structural skill design from scratch.

### Selection Matrix

| Scenario | Model Recommendation | Rationale |
|----------|----------------------|-----------|
| **Critical / Multi-Workflow Dependency** | Opus thinking | Maximum reasoning capability for complex trade-offs and edge cases. |
| **Day-to-Day Authoring (Default)** | Sonnet thinking | Best balance of procedural brevity, guideline adherence, and cost. |
| **Drafting + Subsequent Audit** | Flash (Draft) → Sonnet (Prune) | Fast initial iteration followed by rigorous auditing. |
| **Typos & Single Step Renames** | Composer fast / Flash | Instant localized updates without overhead. |

---

## 3. The 3-Tier Progressive Disclosure Architecture

To keep primary skill bodies (`SKILL.md`) compact (ideally ≤ ~100–150 lines), enforce a strict 3-tier layout:

```
[ Tier 1: SKILL.md ] (Loaded upon skill invocation)
   ├── Frontmatter (triggers & intent scope)
   ├── Entry Gate / Pre-requisites
   ├── State Machine Steps
   └── Verifiable "Done when" per step
        │
        ├──► [ Tier 2: references/*.md ] (Read on demand via view_file)
        │       ├── Detailed schemas & complex examples
        │       └── Edge case handling & domain rules
        │
        └──► [ Tier 3: scripts/* ] (Executed via shell / runner)
                ├── Deterministic validators (linter, schema, AST)
                └── Scaffolding / automated generators
```

> **Mandatory Rule:** Agents must **never** load Tier 2 documentation into context until they reach the specific step that requires it.

---

## 4. Frontmatter & Trigger Budget

Frontmatter (`name`, `description`) is injected into the agent's discovery index before the skill is invoked.

- **Scope:** Keep `description` strictly focused on **trigger conditions and intent matching**.
- **Forbidden:** Do **not** place execution rules, step protocols, or detailed instructions in the frontmatter description.

```yaml
---
name: ws-write-spec
description: Drafts canonical *.spec.md feature specifications from an issue or user prompt. Trigger when user asks to plan a new feature, draft a spec, or convert an issue into a spec.
---
```

---

## 5. Tool-First & Deterministic Anchors

Replace vague prompt directives with deterministic scripts or shell commands whenever possible.

- ❌ **Prompt Directive (Vague):** "Ensure the output JSON file has valid formatting and no missing keys."
- ✅ **Tool Anchor (Deterministic):** "Run `python scripts/validate_json.py {targetFile}`. Done when exit code is 0."

Using scripts eliminates LLM hallucination risk, reduces prompt size, and converts subjective guidelines into binary pass/fail verification.

---

## 6. Pruning Checklist (Zero Sediment)

During Pass 2 (Review), systematically remove all unnecessary text using this checklist:

| Sediment Category | Example to Eliminate | Rationale for Removal | Action / Replacement |
|-------------------|----------------------|-----------------------|----------------------|
| **No-Ops & Echo Statements** | *"Be careful and write clean code."* | Does not constrain the search space or alter LLM behavior. | Replace with explicit constraint or remove. |
| **Open Negative Constraints** | *"Do not do X, Y, Z, A, B, C..."* | LLMs struggle with negative lists. | Define a single positive enclosure (e.g., *"Modify only target file T"*). |
| **Redundant Synonyms** | *"Analyze, inspect, and examine the log."* | Wastes token budget. | Use single imperative verb (e.g., *"Inspect the log."*). |
| **Dual-Path Ambiguity** | *"You may use method A or method B if preferred."* | Causes agent hesitation or loops. | Specify exact path: *"Use A. If A fails with X, use B."* |

---

## 7. Verifiable "Done When" Exit Criteria

Every step in a skill must possess a non-subjective, empirical exit gate.

- ❌ **Subjective:** "Step completed when the unit tests look good."
- ✅ **Empirical:** "Step completed when `npm test` returns exit code 0 and coverage is ≥ 85%."
- ❌ **Subjective:** "Step completed when documentation is updated."
- ✅ **Empirical:** "Step completed when `README.md` contains the updated `## Installation` section."

---

## 8. Empirical Feedback Loop & Telemetry

1. **Dogfooding:** Execute new skills against realistic test cases.
2. **Failure Diagnosis:**
   - Agent ignored a rule? → *Instruction was too far from the action point or buried in prose.*
   - Agent stopped early? → *Step exit criteria were subjective or premature.*
   - Agent hallucinated paths? → *Missing explicit path tokens or CLI script validation.*
3. **Continuous Maintenance:** Update `SKILL.md` based on real execution traces, and record recurring failure traps in the project memory (`MEMORY.md`).

---

## 9. Global Skill Execution & Config Entry Gates

When skills are installed globally (`$HOME/.agents/skills` or `WORKFLOW_SKILLS_GLOBAL_DIR`), they execute against the **current working directory** (`$PWD`).

### Classification of Skills

1. **Config-Dependent Skills:**
   - Skills that require project identity, verification commands, SCM providers, stack companions, or artifact output paths (e.g. `ws-spec-to-pr`, `ws-spec-to-pr-lite`, `ws-multi-spec`, `ws-write-plan`, `ws-implement-tasks`, `ws-code-review`, `ws-testing`, `ws-ship-pr`, `ws-fix-pr`, `ws-github-provider`, `ws-azure-devops-provider`, `ws-configure-project`).
   - **Mandatory Entry Gate:** Must check if `$PWD/.agents/skills/ws-shared/config.json` exists in the consuming repository.
   - **Missing Config Protocol:** If missing or unconfigured, the skill MUST trigger a `user-gate` telling the user to run `ws-configure-project` (or offer an option/gate to invoke `ws-configure-project` immediately to seed and configure `.agents/skills/ws-shared/config.json`).
2. **Config-Independent / Standalone Skills:**
   - Pure utility or governance skills that operate without project hub config (e.g. `ws-secrets-leak-review`, `ws-karpathy-guidelines`, `ws-tdah`, `ws-write-a-skill`, `ws-spec-format`, `ws-check-harness`).
   - Can execute directly in any repository without prompting for `ws-configure-project`.
