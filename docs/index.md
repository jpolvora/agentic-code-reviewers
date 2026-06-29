# Agentic Code Reviewers — Documentation

> Plug-in documentation for **Agentic Code Reviewers** — the multi-agent, pluggable, extensible, multi- platform Pull Request reviewer for Azure DevOps and GitHub.
>
> **Language policy:** All documentation in this repository is English-only (see [`AGENTS.md`](../AGENTS.md) § Invariant Behavior).

---

## How to read this documentation

Each topic starts with a short overview here. Follow the link for the full deep dive.

| Topic | Deep dive |
|-------|-----------|
| Execution flow (config → diff → gate → publish) | [`flow-analysis.md`](flow-analysis.md) |
| Two-phase analysis model (triage → investigation) | [`two-phase-execution-model.md`](two-phase-execution-model.md) |
| Score, severity and what becomes a thread | [`score_calc.md`](score_calc.md) |
| Auto-fix self-healing loop | [`auto-fix.md`](auto-fix.md) |
| Consumer: setting up review + auto-fix workflows | [`workflows.md`](workflows.md#41-setting-up-review--auto-fix-two-workflow-loop) |
| All execution paths (local, CI, IDE, engines) | [`workflows.md`](workflows.md) |
| Frequently asked questions | [`faq.md`](faq.md) |

User-facing setup, CLI and CI templates live in [`../README.md`](../README.md). Agent-facing rules live in [`../AGENTS.md`](../AGENTS.md).

---

## 1. What it is

A **read-only** reviewer that orchestrates LLM agents over a PR diff, follows the project harness (`AGENTS.md`, `.cursor/rules/`, code-review skills) and publishes actionable threads on the PR in Azure DevOps or GitHub. It does **not** modify code in the default review flow; auto-fix is an opt-in separate branch.

**Pipeline never blocks the build:** exit `0` even with open threads; `1` only on fatal config/agent errors. A GitHub ruleset (`required_review_thread_resolution`) blocks merge while threads are open — independent of the runner's exit code.

Full life cycle: [`flow-analysis.md`](flow-analysis.md).

---

## 2. Engines

The LLM layer is pluggable via `AGENTIC_CODE_REVIEWERS_ENGINE`. The orchestrator, prompt and gate stay identical when you swap engines.

| Engine | Package | When to use |
|--------|---------|-------------|
| `cursor-sdk` (default) | `@cursor/sdk` | CI; native Cursor models |
| `opencode` | `@opencode-ai/sdk` | Local dev / OpenCode providers (Zen, Go, LM Studio); embedded server by default |
| Custom | your adapter | Fork, implement `ExecutionEngine`, open a PR |

The same `config.scoreMin` flows into prompt, gate and Safe Outputs for both engines. See [`../README.md`](../README.md) § Engines and [`workflows.md`](workflows.md) § Engines.

---

## 3. Platforms

| Provider | Activation |
|----------|------------|
| Azure DevOps (`AdoProvider`) | `--ado` or auto-detected from `SYSTEM_*` pipeline vars |
| GitHub (`GithubProvider`) | `--gh` or auto-detected from `GITHUB_*` / Actions context |
| Custom (GitLab, Bitbucket, …) | Implement `PlatformProvider` in `src/provider/` |

Every feature must work on both supported providers (markdown, GraphQL/REST, inline suggestions differ).

---

## 4. Stacks

Stack selection (`--stack` / `AGENTIC_CODE_REVIEWERS_STACK` / auto-detect) chooses which file extensions are eligible for review and which per-stack recommendations are injected into the prompt.

Built-in: `ABP/Angular` (default fallback), `PHP/Laravel`, `Next.js/React`, `TypeScript`, `Custom`.

Auto-detection inspects the repo root (`artisan` → Laravel, `next.config.*` → Next.js, `angular.json`/`@angular/core` → ABP/Angular, `.sln`/`.csproj` → C#/.NET, `tsconfig.json` → TypeScript). `--seed-test` forces `ABP/Angular`.

See [`../README.md`](../README.md) § Stacks and the per-stack prompts in [`../skills/stacks/`](../skills/stacks/).

---

## 5. Two-phase analysis

A single agent call runs **two phases** — (1) conservative triage over the diff, (2) tool-based investigation with the four mandatory proofs (`Evidence`, `Scenario`, `Missing protection`, `Discards`). The agent emits **one** JSON block at the end; there is no second LLM pass.

Deep dive: [`two-phase-execution-model.md`](two-phase-execution-model.md).

---

## 6. Score and severity

The agent assigns an ordinal `score` (0–10) and a `severity` (`critical` | `warning` | `suggestion`) qualitatively; the runner validates the contract and the publication range `AGENTIC_CODE_REVIEWERS_SCORE_MIN`–10 (default **6**–10). Below the threshold (opt-in via `--score-min` / env) findings are discarded before posting.

| Score | Severity | Becomes a thread? |
|-------|----------|----|
| 0–5 | any | No |
| 6–8 | `warning`/`suggestion` | Yes |
| 9–10 | `critical` | Yes |

After `AGENTIC_CODE_REVIEWERS_MAX_ROUNDS` (default 10) the runner publishes only `critical` and asks for human review.

Rubric, gate, examples: [`score_calc.md`](score_calc.md).

---

## 7. Gates and Safe Outputs

Two deterministic filters run **after** the LLM, before posting:

- **Publishable gate** (`src/ado/review-validation.ts` → `isPublishableReview`) — score range, required fields, `developerAction` ∈ {`fix-code`, `escalate`}, `impactPaths` non-empty.
- **Safe Outputs** (`src/ado/safe-outputs.ts`, default ON) — diff-line anchoring, protected paths (CI/locks), severity↔score consistency, plain-English 4-section analysis, size limit (`AGENTIC_CODE_REVIEWERS_MAX_COMMENT_CHARS`), secret/HTML scrubbing.

Both use the same `config.scoreMin`.

---

## 8. Round budget and escalation

A hidden comment marker (`<!-- reviewer-round-state -->`) tracks how many review↔fix rounds have run on a PR. When `currentRound > AGENTIC_CODE_REVIEWERS_MAX_ROUNDS` (default 10) and there are still open bot threads, the runner publishes only `critical` findings and adds a **human review recommended** handoff note. Set `0` to disable.

Covered in [`flow-analysis.md`](flow-analysis.md) § Round convergence and [`faq.md`](faq.md) § Escalation.

---

## 9. Auto-fix (self-healing loop)

The default review flow is read-only. The opt-in `--auto-fix` mode (or the GitHub [`auto-fix.yml`](../.github/workflows/auto-fix.yml) workflow) reads active bot threads, applies surgical fixes per file via sub-agents, commits locally, runs a build gate, resolves the modified threads, and pushes — re-triggering code review.

Protections: build gate before push, partial thread resolution (only threads whose line changed), per-PR concurrency, `MAX_ROUNDS` escalation, explicit failure if all configured engines fail. Requires PAT (`AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN`) to re-trigger workflows.

Full cycle, PAT setup, failure modes: [`auto-fix.md`](auto-fix.md).

---

## 10. IDE skills

Layered on top of the CI runtime prompts in `skills/`, the repo ships IDE-only skills in [`.agents/skills/`](../.agents/skills/):

| Skill | Invocation | Mode |
|-------|------------|------|
| `code-review-self` | `/code-review-self` | Read-only dry-run mirroring `src/index.ts` without `@cursor/sdk` |
| `megabrain` | `/megabrain` | Iterative review with persistent `[Thread #N]` tracking |
| `solve-pr` | `/solve-pr` | Fetches open GitHub threads → fix → commit/push → wait for next review |

Routing and authoring guide: [`../AGENTS.md`](../AGENTS.md) § Skills — Routing and Management.

---

## 11. Local execution and tests

| Command | Purpose |
|---------|---------|
| `npm run review -- --dry-run` | Local dry-run against the current branch |
| `npm test` | Strict typecheck + Vitest unit tests |
| `npm run test:seed` | E2E: install defect fixtures, run dry-run, validate against `SEED-ISSUES.md`, uninstall |
| `npm run review:local` | Shortcut for a local `--dry-run` |
| `bash run.sh --local …` | Run the portable `run.sh` in local mode (no clone of `release`) |

See [`../README.md`](../README.md) § Local execution and tests.

---

## 12. Reference

| Layer | File |
|-------|------|
| Orchestrator | `src/index.ts` |
| Config / CLI / env | `src/config.ts`, `src/env.ts` |
| Prompt assembly | `src/agent/prompt.ts`, `src/agent/runner.ts` |
| Engines | `src/engine/` |
| Providers | `src/provider/` |
| Gates | `src/ado/review-validation.ts`, `src/ado/safe-outputs.ts` |
| Rounds / escalation | `src/ado/round-state.ts` |
| Post / format threads | `src/ado/post-comments.ts`, `src/ado/format-thread.ts` |
| Auto-fix | `src/orchestrator/autofix-runner.ts`, `src/git/autofix-commit.ts`, `src/git/autofix-build.ts` |
| JSON parser | `src/parser/review-response.ts` |
| Runtime prompts | `skills/SYSTEM_PROMPT.md`, `skills/CODE_REVIEW.md`, `skills/stacks/`, `skills/tasks/` |
| Runner script | [`run.sh`](../run.sh) |
| CI workflows | [`.github/workflows/`](../.github/workflows/) |
| Pipeline templates | [`azure-pipelines-cursor-code-review.yml`](../azure-pipelines-cursor-code-review.yml), [`examples/consumer-github-workflow.yml`](../examples/consumer-github-workflow.yml) |
| Seed issues | [`SEED-ISSUES.md`](../SEED-ISSUES.md) |