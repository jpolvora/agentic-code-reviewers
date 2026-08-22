---
name: ws-doctor
description: Workflow skills diagnostic inspector — read-only diagnose of path errors, tool/script recipes, config switches, and missing references across installed ws-* skills.
version: 0.3.30
disable-model-invocation: true
invocation_names:
  - doctor
  - ws-doctor
---

# ws-doctor

> When this skill is loaded, output "ws-doctor loaded."

**Leading word:** *diagnose* — runtime install health of `ws-*` skills, not a meta-harness integrity audit or a session snapshot.

Read-only by default (v1): emit one structured report, then **stop**. No file edits; no fix-apply mode.

Language: **en-us**. Harness-neutral: portable aliases from [`tools.md`](../ws-shared/tools.md) only (`user-gate`, path tokens, explicit `python` / `node` / `bash` launchers).

## Boundaries

| Skill | Use when |
|-------|----------|
| **This skill** | Broken paths after token expand, missing launchers / scripts, parse failures, live `config.json` summary, missing companion refs |
| [`ws-check-harness`](../ws-check-harness/SKILL.md) | Phases 0–5c integrity, routing, portability, digests, topology |
| `ws-show-harness` (Extra package) | What is active in the **current session** |

Do not re-run check-harness phases or invent a session autoload snapshot inside doctor.

## Invocation

```
/ws-doctor [--skill <id>] [--json] [--persist]
```

Also: `@ws-doctor`, “diagnose skills”, “doctor the harness”.

| Flag | Effect |
|------|--------|
| *(none)* | Full diagnose → human markdown report; **read-only** |
| `--skill <id>` | Limit skill-tree scan to one `ws-*` folder (config section still summarized when available) |
| `--json` | Machine-readable report with the same four sections |
| `--persist` | Explicitly save the same report as a timestamped artifact under `plans.diagnosticsDir` (default `.agents/plans/diagnostics`) so runs can be compared; omitted remains read-only |

## Hybrid & config

1. Expand `{skillsRoot}` **independently** from `{sharedDir}` (and related tokens) per [`tools.md`](../ws-shared/tools.md) § Path tokens · [`config-resolution.md`](../ws-shared/config-resolution.md).
2. Project `{sharedDir}/config.json` **always wins** over any global hub config. Never read project config from the global hub when a project hub exists.
3. Missing `{sharedDir}/config.json`: still run path / script / reference checks against the resolved skills root; report Configuration as **unavailable**; `user-gate` recommending [`ws-configure-project`](../ws-configure-project/SKILL.md) (native structured choice when available; markdown fallback). Do **not** invent config values.

## Steps

| Step | Do | Done when |
|------|-----|-----------|
| **1 Resolve** | Load path tokens from project config when present; resolve `{skillsRoot}` (+ `{globalSkillsRoot}` for hybrid missing local ids) and `{sharedDir}` | Roots known; hybrid override rules applied |
| **2 Diagnose** | Run the diagnostic engine (read-only) | Script exits; stdout holds the report |
| **3 Report** | Print the four sections below (or `--json`); if config unavailable, include the configure-project gate tip | Report delivered; **no edits** |

**Launcher (mandatory):**

```bash
node {skillsRoot}/ws-doctor/scripts/doctor.js [--skill <id>] [--json] [--persist]
```

Parse checks inside the engine are syntax-only (Python `ast.parse` with UTF-8 read and no `.pyc` write, `node --check`, `bash -n` when available). Soft-skip when a launcher binary is missing on PATH (report skip, do not fail the doctor process itself).

## Report contract

Every run emits these sections (markdown headings, or matching keys under `--json`). Healthy installs may use `none` where noted.

### Path errors

Each broken or unresolvable path after token expansion: skill id (or hub file), cited path, expand result. Or `none`.

### Tool / script diagnostics

(a) Managed-script invocations missing an explicit `python` / `node` / `bash` launcher  
(b) Cited script paths that do not exist  
(c) Skill scripts under `ws-*/scripts/` that fail lightweight parse checks — path + error summary  

Or `none`.

### Configuration

When `{sharedDir}/config.json` is present: path tokens, `providers`, `verification.*`, `defaults.*` switches (including `deliveryCommitArtifacts.*`), `invariants.*`, `fable.*`, `rules.*` paths. Mark missing file, schema-invalid fields, and empty required identity fields when detectable.

When absent: **unavailable** + recommend `ws-configure-project` via `user-gate` (do not invent values).

### Missing references

`SKILL.md` / hub Markdown or brace-token links to companion files (`PHASES.md`, `FORMAT.md`, `STEP-DISPATCH.md`, scripts, etc.) absent after expand. Or `none`.

## Guardrails

- Read-only v1 — do not write skill, hub, or config files.
- Do not dump secrets / env-backed credentials; report key names and empty markers only.
- Expand braces before claiming a broken link; unknown braces → templates (skip). Do not treat URL schemes as Windows drive paths.
- Explicit launchers only for managed scripts (including this skill’s `doctor.js`).
