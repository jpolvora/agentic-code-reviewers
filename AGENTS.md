# Agentic Code Reviewers — Agent Reference

Operational guide for AI agents in this repository (**Multi Agent Code Reviewer** — pluggable, extensible, multi-stack, multi-platform). Two agent profiles:
- **Analyzer Agent** — invoked by the runner to review a PR.
- **Developer Agent** — modifies or extends the runner itself.

---

## Invariant Behavior

- **Only implement what is explicitly requested.** On any ambiguity or design fork, stop and ask.
- **Be critical, not compliant.** Challenge assumptions; reject architecturally unsound suggestions with a technical rationale.
- **Simplicity first.** Minimal changes, no workarounds, no over-engineering.
- **Think more, write less.** Prefer elegant solutions over verbose ones. Less code is better: eliminate redundancy, abstract only when two or more real cases exist.
- **No token maxxing.** Responses and diffs must be concise. Avoid comments that merely paraphrase code, unnecessary explanatory prose, and mechanically generated boilerplate.
- **Tests are a contract, not optional.** Every feature or fix must ship with tests covering the happy path and relevant edge cases. Never delete existing tests unless they are dead code or unreachable.
- **Documentation stays in sync with code.** After every implementation (feature, fix, or behavior change), update **all affected documentation** in the same change set — do not merge code that drifts from docs. Minimum checklist when touching runner behavior:
  - **`AGENTS.md`** — architecture, env vars, gate rules, skills routing
  - **`README.md`** — user-facing features, CLI, workflows, env tables
  - **`docs/`** — `index.md`, `faq.md`, and topic docs (`flow-analysis.md`, `score_calc.md`, `auto-fix.md`, `two-phase-execution-model.md`) as applicable
  - **`skills/`** — when prompts, JSON contract, or gate policy change (`SYSTEM_PROMPT.md`, `AUTO_FIX.md`, stacks)
  - **`.env.example`** — when env vars are added, renamed, or defaults change
  - **Workflow examples** — `examples/`, `.github/workflows/` when CI inputs or behavior change
  - Run **`npm test`** (and `npm run test:seed` when review/detection behavior changes) before considering the task done.
- **Decompose before executing.** Break large tasks into independent subtasks. When possible, parallelize with subagents sharing only the minimum necessary context — keep context windows small.

---

## 1. Analyzer Agent

### Operating Mode
- Strictly **read-only**. Forbidden: commits, push, file modifications in the target repository, formatters/linters.
- Allowed: `read_file`, `grep_search`, `glob`, semantic search, diff inspection.
- The sandbox (`local.sandboxOptions.enabled` in `src/engine/cursor-sdk/stream.ts`) enforces this contract at the SDK level.

### Two-Phase Analysis

**Phase 1 — Triage:** examine the diff. Identify candidates with real failures (security, concurrency, resource leaks, logic bugs). Immediately discard: nits, style, preferences, and conceptual warnings with no executable failure path.

**Phase 2 — Investigation:** for each candidate, use `read_file` and `grep_search` to read the full file, tests, callers, and related middlewares. A finding is only valid if you can fill in all four steps below in the `analysis` field:
1. **Evidence** — files and symbols read.
2. **Scenario** — how the failure occurs in practice.
3. **Missing protection** — why existing validations/tests do not block the failure.
4. **Discards** — alternative hypotheses tested and rejected.

If you cannot fill in all four steps, discard the finding.

### Target Project Harness Lookup
Before reviewing, check in `repoRoot` (in this order, if they exist):
1. Project `AGENTS.md`.
2. `.cursor/rules/main.mdc` or pre-mapped rules in the prompt.
3. `.agents/skills/code-review/SKILL.md`.
4. `docs/` — domain and architecture rules.

### JSON Output Contract
Respond **exclusively** with a JSON block containing:

```json
{
  "reviews": [
    {
      "fileName": "/src/MyClass.cs",
      "lineNumber": 15,
      "severity": "critical",
      "comment": "Short description of the failure (no code blocks).",
      "score": 9,
      "developerAction": "fix-code",
      "analysis": "1. Evidence: ... 2. Scenario: ... 3. Protection: ... 4. Discards: ...",
      "impactPaths": ["/src/MyClass.cs", "/src/Middlewares/Auth.cs"],
      "suggestedFix": "```csharp\n// surgical fix\n```"
    }
  ],
  "resolvedThreads": [
    { "threadId": 12345, "note": "Fixed at line 15." }
  ],
  "reviewSummary": ""
}
```

### Gate Rules (`src/ado/review-validation.ts`)
Findings that violate any rule below are automatically discarded:

| Field | Rule |
|---|---|
| `score` | Integer between **AGENTIC_CODE_REVIEWERS_SCORE_MIN–10** (default `6`). Score below the minimum is discarded. Omitting env / `--score-min` preserves the threshold of 6. |
| `fileName` + `lineNumber` | Must point to lines changed in the diff (lineNumber > 0). |
| `severity` | `critical` (score 9–10) · `warning` (6–8) · `suggestion` (6–7) |
| `developerAction` | `fix-code` or `escalate`. Never `resolve-comment` in new reviews. |
| `suggestedFix` | Optional. In Azure DevOps, do not use the ` ```suggestion ` fence. In GitHub, you may use it to enable the one-click apply button. |
| `analysis` | Required with all 4 steps of the structured proof. |
| `impactPaths` | Array with at least one read file that supports the investigation. |

### PR Summary Comment (`shouldPostReviewSummary` in `src/ado/post-comments.ts`)

The bot posts a **general PR summary comment** only at the **end** of a review run, after resolving threads and posting new ones, when **no active/pending runner threads** remain on the PR (`Agentic Code Reviewer` prefix). `score_min` controls which findings become threads; the summary is independent of the agent's `reviewSummary` field. When posted, the runner uses `CLEAN_PR_SUMMARY_MESSAGE` in `src/git/markers.ts`. Comment tag is `buildBotTag(engine)` from `src/bot-tag.ts`.

### Safe Outputs (`src/ado/safe-outputs.ts`)

After `isPublishableReview`, the **Safe Outputs** gate (default ON via `AGENTIC_CODE_REVIEWERS_SAFE_OUTPUTS`) applies additional deterministic validation:

| Rule | Description |
|---|---|
| Diff-line anchoring | `lineNumber` must be on a changed line in the diff (`AGENTIC_CODE_REVIEWERS_REQUIRE_DIFF_LINE`, default `true`) |
| Protected paths | Blocks reviews referencing CI, manifests, locks (globs + `AGENTIC_CODE_REVIEWERS_PROTECTED_PATTERNS`) |
| Severity ↔ score | Consistency required (`critical` 9–10; `warning`/`suggestion` floors respect **`config.scoreMin`** in `safe-outputs.ts`) |
| Analysis structure | Four numbered sections (Evidence, Scenario, Protection, Discards) |
| Size limits | `AGENTIC_CODE_REVIEWERS_MAX_COMMENT_CHARS` (default 8000) |
| Secrets / markdown | Blocks credential patterns and dangerous HTML/script |

### Rounds and Escalation
The runner tracks iterations via the `<!-- reviewer-round-state -->` marker. When `AGENTIC_CODE_REVIEWERS_MAX_ROUNDS` (default: 5) is exceeded:
- Suppress `warning` and `suggestion` findings.
- Publish only `critical` (security or business invariant breaks).
- The runner will add a handoff warning for human review on the PR.

The runner excludes itself from the diff by default (avoids loops). Set `AGENTIC_CODE_REVIEWERS_REVIEW_SELF=true` to review the runner's own codebase — includes the runner folder in the diff and merges `**/*.yml`, `**/*.yaml`, `**/*.sh` into the stack includes (unless `INCLUDE_PATTERNS` is explicitly set).

### Environment Variables

All runner variables use the **`AGENTIC_CODE_REVIEWERS_`** prefix, except credentials **`CURSOR_API_KEY`** and **`OPENCODE_API_KEY`** (no prefix; `OPENCODE_API_KEY` is read by `run.sh`/CI, **not** by `env.*`). TypeScript reader: `src/env.ts` (`readEnv`, `ENV`, `env.*`).

> **Migration:** `CURSOR_REVIEWER_*` was replaced by `AGENTIC_CODE_REVIEWERS_*`. `AGENTIC_CODE_REVIEWERS_REPO_URL` and `AGENTIC_CODE_REVIEWERS_EXECUTION_MODE` exist only in `run.sh`/workflow — removed from `env.ts`.

**Essential** (`.env.example`):

| Variable | Default | Usage |
|---|---|---|
| `CURSOR_API_KEY` | — | Required with `cursor-sdk` engine |
| `OPENCODE_API_KEY` | — | OpenCode Go in CI (`run.sh` → `auth.json`; not via `env.*`) |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | `cursor-sdk` | `cursor-sdk` \| `opencode` |
| `AGENTIC_CODE_REVIEWERS_MODEL` | per engine | Cursor ID or `provider/model` |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` | — | External server; **empty = embedded** |
| `AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT` | — | ADO PAT (local) |
| `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` | — | GitHub token (local); fallback `GITHUB_TOKEN` / `GH_TOKEN` |
| `AGENTIC_CODE_REVIEWERS_TARGET_BRANCH` | `refs/heads/master` | Diff comparison branch |
| `AGENTIC_CODE_REVIEWERS_REVIEW_SELF` | `false` | Include runner in diff (CI of this repo) |

**Advanced** (defaults OK — see README § Advanced Configuration): OpenCode hostname/port/agent/bin/log/stream-reasoning, `VERBOSE`, `TIMEOUT_MS`, `SCORE_MIN`, `SAFE_OUTPUTS`, `PARALLEL_CHUNKS`, `MCP_ENABLED`, `MAX_ROUNDS`, `STACK`, `INCLUDE_PATTERNS`, `SANDBOX`, etc.

**`run.sh` only:** `AGENTIC_CODE_REVIEWERS_REPO_URL`, `AGENTIC_CODE_REVIEWERS_RELEASE_BRANCH`, `AGENTIC_CODE_REVIEWERS_LOCAL`, `AGENTIC_CODE_REVIEWERS_USE_TSX`.

**CI workflow only:** repository variable `AGENTIC_CODE_REVIEWERS_EXECUTION_MODE` (`parallel` \| `sequential`); not processed by `env.ts`.

Full list: [`.env.example`](.env.example), [`README.md`](README.md), [`docs/index.md`](docs/index.md).

**Precedence:** CLI flags (`--engine`, `--model`, `--score-min`) > canonical env > default.

---

## 2. Developer Agent

### Architecture

| File/Folder | Responsibility |
|---|---|
| `src/index.ts` | Entry point: prepares workspace, collects PR context, triggers agent, posts comments. |
| `src/config.ts` | CLI arguments and environment variables. |
| `src/env.ts` | `AGENTIC_CODE_REVIEWERS_*` prefix, unprefixed credentials, `env.*` readers. |
| `src/engine/` | `ExecutionEngine` interface + `getEngine()` factory. Engines: `cursor-sdk` (default), `opencode` (`@opencode-ai/sdk`); extensible via PR. |
| `src/engine/opencode/stream.ts` | OpenCode session, prompt, SSE event stream, timeout/abort. |
| `src/engine/opencode/fetch.ts` | `undici` fetch with `headersTimeout` aligned to `TIMEOUT_MS` + `AbortSignal`. |
| `src/engine/opencode/server.ts` | `createEmbeddedOpencodeServer` — spawns `opencode serve`; does not reuse an external server without a harness. |
| `src/engine/opencode/server-config.ts` | Embedded config (model, log level, deny permissions, harness `instructions`). |
| `src/engine/opencode/harness-instructions.ts` | `instructions` globs injected into the embedded server (parity with `settingSources: ['project']`). |
| `src/engine/opencode/event-stream.ts` | Consumes `/global/event` and auto-replies to permission prompts. |
| `src/engine/cursor-sdk/stream.ts` | **Coupled to `@cursor/sdk`.** Streaming, timeout, sandbox, token usage. |
| `run.sh` | Portable runner: **remote** mode (clone `release`) or **local** (`--local`, CI of this repo). |
| `.github/workflows/code-review.yml` | CI of this repo — `run.sh --local`, engine matrix. |
| `.github/rulesets/agentic-main.json` | Branch ruleset on **`main`**: PR required, all review threads resolved before merge. Apply via `scripts/apply-rulesets.sh`. |
| `.github/workflows/review-remote.yml` | Reusable workflow for consumer repositories. |
| `.github/workflows/auto-fix.yml` | CI self-healing loop — triggers after successful code review (`workflow_run`) |
| `examples/consumer-github-workflow.yml` | Copy-paste template for GitHub consumers. |
| `src/orchestrator/autofix-runner.ts` | Auto-fix flow: all open review threads (`openReviewThreads`), subagents per file, cooperative resolve |
| `src/git/autofix-commit.ts` | Consolidated commit and push after auto-fix |
| `skills/AUTO_FIX.md` | Auto-fix subagent prompt (surgical fixes, JSON replacements) |
| `skills/COOPERATIVE_FIX.md` | Shared fix contract (Auto-Fix CI ↔ solve-pr IDE, no code coupling) |
| `.cursor/rules/karpathy-guidelines.mdc` | Behavioral guidelines referenced by auto-fix and developer agents |
| `src/agent/runner.ts` | Builds the prompt and delegates to the injected `ExecutionEngine`. |
| `src/provider/` | `PlatformProvider` interface + `AdoProvider` and `GithubProvider` implementations. |
| `src/ado/` | Gate (`gate.ts`), validation (`review-validation.ts`), safe outputs (`safe-outputs.ts`), formatting (`format-thread.ts`), rounds (`round-state.ts`). |
| `src/orchestrator/` | In-process parallelism (`parallel-runner.ts`), merge (`merge-reviews.ts`), optional meta-reviewer. |
| `src/mcp/` | Read-only context tools (`review-tools.ts`) and prompt injection. |
| `skills/stacks/` | Per-stack Markdown recommendations (loaded by the runner). |
| `skills/SYSTEM_PROMPT.md` | JSON contract, score, severity, publishing policy. |
| `skills/CODE_REVIEW.md` | Generic code review harness (injected into the prompt). |
| `.agents/skills/` | Agentic skills for **Cursor/IDE** (outside `@cursor/sdk`). |

### Skills — Routing and Management

The repository has **two layers** of "skills". Do not confuse them:

| Layer | Location | Loaded by | When |
|---|---|---|---|
| **Runtime prompts** | `skills/` | `buildAgentPrompt()` in `src/agent/prompt.ts` | Every execution via `npm run review`, CI, or `run.sh` |
| **IDE skills** | `.agents/skills/<name>/SKILL.md` | Cursor agent when the user invokes `/<name>` | Local development, manual dry-runs, fix/review cycle |

#### Runtime Prompts (`skills/`)

Prompt assembly order in `buildAgentPrompt`:

1. `skills/SYSTEM_PROMPT.md` — JSON contract, score × severity tables, ADO/GitHub publishing policy.
2. `skills/CODE_REVIEW.md` — generic project harness.
3. `skills/stacks/<stack>.md` — stack recommendations (`AGENTIC_CODE_REVIEWERS_STACK` / `--stack`).
4. Dynamic context — diff, `.cursor/rules/*.mdc` rules, PR, work items, existing threads.
5. Two-phase workflow — Phase 1/2/3 instructions; injects `AGENTIC_CODE_REVIEWERS_SCORE_MIN` into the filter.

The CI agent does **not** read `.agents/skills/` automatically — only what the runner embeds in the prompt. Cross-reference in the prompt: the target project's generic code-review skill at `.agents/skills/code-review/SKILL.md` (if it exists in `repoRoot`).

#### IDE Skills (`.agents/skills/`)

| Skill | Invocation | Mode | Mirrored pipeline |
|---|---|---|---|
| [`code-review-self`](.agents/skills/code-review-self/SKILL.md) | `/code-review-self` | Read-only | `src/index.ts` — triage, gate, rounds, identical JSON |
| [`megabrain`](.agents/skills/megabrain/SKILL.md) | `/megabrain` | Read-only | Iterative review with `[Thread #N]`; evaluates `RESOLVED`/`UNRESOLVED` |
| [`solve-pr`](.agents/skills/solve-pr/SKILL.md) | `/solve-pr` | Read + write | Fetches all open GitHub threads → fix → commit/push → new CI round |

**Routing — which to use?**

```
PR in CI (ADO/GitHub)      → automatic runner (npm run review / workflow)
Local dry-run without SDK  → code-review-self
Follow-up after fixes      → megabrain (human threads) or runner (bot threads)
Fix review threads locally      → solve-pr (GitHub) or manual dev
```

| Scenario | Skill / path |
|---|---|
| Validate gate and prompt before merge | `code-review-self` + `npm test` |
| Conversational review with stable IDs | `megabrain` |
| Bot published threads; want auto-fix in CI | `auto-fix.yml` + `--auto-fix` (see `skills/COOPERATIVE_FIX.md`) |
| Open review threads; want local fix cycle | `/solve-pr` (same cooperative gate as Auto-Fix CI) |
| Production / pipeline | No IDE skill — runner + `skills/` only |

#### Adding or Modifying an IDE Skill

1. Create `.agents/skills/<name>/SKILL.md` with `name` + `description` frontmatter (Cursor trigger).
2. Document mode (read-only vs. write), env prerequisites, and step-by-step flow.
3. Auxiliary scripts in `.agents/skills/<name>/scripts/` (e.g., `solve-pr`).
4. Update **this** `AGENTS.md`, [`README.md`](README.md), and the table in [`docs/index.md`](docs/index.md).
5. Generic skills reusable across projects → [workflow-skills](https://github.com/jpolvora/workflow-skills).

#### Adding a Runtime Stack

1. Register in `STACKS` + `getStackConfig` (`src/config.ts`).
2. Create `skills/stacks/<name>.md`.
3. Cover auto-detection in `test/config.test.ts`.
4. **Sync** `README.md`, `AGENTS.md`, `docs/`, and `.env.example` when changing env vars, workflows, stacks, or engines.

### Validation and Local Execution Commands

When developing or debugging the runner infrastructure, use the following commands:

```bash
# Manual execution and simulations (dry-run)
npm run review:local      # Runs the local runner (via tsx) against the current branch (dry-run)
bash run.sh --local ...   # Tests the CI wrapper script running TypeScript natively

# Build and Tests (required before opening a PR)
npm run build             # Compiles the project (dist/index.js) — validates typing and bundling
npm test                  # Strict typecheck + unit test suite (Vitest)
npm run test:seed         # E2E: installs fixtures locally, runs agent dry-run, validates coverage against SEED-ISSUES.md, and deallocates fixtures
npm run seed:verify-clean # Utility to ensure the E2E suite left no tracked fixture litter in the working tree
```

### Best Practices

- **Providers:** every new feature must work on both Azure DevOps **and** GitHub. Markdown, GraphQL/REST, and interactive suggestions differ between platforms.
- **Stacks:** when adding/modifying stacks, maintain compatibility with the `ABP/Angular` fallback and cover auto-detection in `test/config.test.ts`.
- **Doc sync (mandatory):** when changing `review-validation.ts`, `safe-outputs.ts`, `round-state.ts`, diff logic, stacks, prompts, env vars (`src/env.ts`), workflows, or skills, update **`AGENTS.md`**, **`README.md`**, and **`docs/`** in the same PR. The Definition of Done for the Developer Agent requires tests **and** synced documentation — code without updated docs is incomplete.

### Definition of Done (Developer Agent)

Before marking any runner change complete:

1. **Behavior proved by tests** — `npm test` passes; new logic has unit/integration coverage for happy path and material edge cases.
2. **Documentation updated** — every user- or agent-visible change reflected in the doc checklist under *Invariant Behavior* (README, AGENTS.md, docs/, skills/, `.env.example`, workflow examples as applicable).
3. **No stale references** — remove or update mentions of removed flags, env vars, or workflows; do not document features that no longer exist.
4. **Cross-engine parity** — `cursor-sdk` and `opencode` share the same prompt, gate, and `config.scoreMin`; verify both paths when changing orchestration or validation.

### Local Skills — Quick Reference

See [Skills — Routing and Management](#skills--routing-and-management) above. Summary:

| Skill | Usage |
|---|---|
| `code-review-self` | Read-only agentic review via IDE, without `@cursor/sdk`. |
| `megabrain` | Numbered threads (`[Thread #N]`); follow-up across commits. |
| `solve-pr` | Open GitHub threads → fix → commit/push → awaits runner. |

When adding or modifying skills, update this file, `README.md`, and `docs/index.md`.
