---
name: ws-plan-to-tasks
description: Task DAG breakdown generator — transforms approved implementation plans into atomic, dependency-mapped task execution graphs.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - plan-to-tasks
  - ws-plan-to-tasks
---

# ws-plan-to-tasks

> When this skill is loaded, output "ws-plan-to-tasks loaded."

**Entry check:** Follow [`config-resolution.md`](../ws-shared/config-resolution.md) § Entry check.

Read the finalized plan (`step-02-{slug}.plan.refined.md`, or `step-01-{slug}.plan.md` if Step 2 was bypassed) and decompose it into atomic tasks. 

**Canonical paths:** `{us-dir}/step-03-{slug}.plan.exec.md` (human-readable) and `{us-dir}/step-03-{slug}.exec.dag.json` (machine-readable).

## Invocation

Standalone:

```
/plan-to-tasks <plan-path> [thresholds=<path>]
```

Workflow (ws-spec-to-pr Step 3): orchestrator passes `planPath` (`step-02-*.plan.refined.md` or `step-01-*.plan.md`) from state.

| Parameter | Default | Notes |
|-----------|---------|-------|
| `<plan-path>` | required | Refined or draft plan path |
| `thresholds` | `config.json` | Sequential-detection limits |

## Steps

1. **Detect size & mode** — Check `config.json` -> `defaults.enableDag`:
   - If `enableDag` is `false` (or omitted/default): set `execMode: sequential` (forces sequential task execution by subagents one by one, skipping parallel DAG generation).
   - If `enableDag` is `true`: evaluate the plan against `config.json.dagThresholds` (default: steps ≤3, files ≤6, layers ≤2). All within threshold → `execMode: sequential`. Any exceeded, or the step breakdown is ambiguous → `execMode: parallel`.
   - Done when: `execMode` is set with its counted metrics (steps, files, layers).

2. **Write sequential output** (when `execMode: sequential`) — Write `step-03-{slug}.plan.exec.md` noting the reason and thresholds, and `step-03-{slug}.exec.dag.json`:

   ```json
   {"execMode": "sequential", "reason": "{n} steps, {m} files, {k} layers", "planPath": "{source plan path}", "tasks": [], "levels": []}
   ```

   - Done when: both files exist and `planPath` references the source plan.

3. **Write DAG output** (when `execMode: parallel`) — Decompose steps into atomic tasks (`T1`, `T2`, ...); no two concurrent tasks in the same level touch the same file; max 3 concurrent tasks per level. Write `step-03-{slug}.plan.exec.md` (levels, dependencies, target files, ACs, coder prompts) and `step-03-{slug}.exec.dag.json`:

   ```json
   {
     "execMode": "parallel",
     "targetModel": "coder",
     "tasks": [
       {"id": "T1", "parallelGroup": null, "dependsOn": [], "files": ["path/to/File"], "acceptance": "...", "coderPrompt": "...", "title": "..."}
     ],
     "levels": [["T1"], ["T2", "T3"]]
   }
   ```

   - Done when: every plan step maps to ≥1 task, every task has non-empty `files` and `coderPrompt`, and no file collision exists within a level.

4. **Handoff** — Return both output paths for [ws-implement-tasks](../ws-implement-tasks/SKILL.md).
   - Done when: caller has the `step-03-` exec.md and dag.json paths.

## Rules of Engagement

- Do not write product code: only structure the plan into tasks.
- Strict isolation: tasks in the same parallel level never share files (prevents worktree merge conflicts).
- Consult `config.json` for layer boundaries and project paths.
