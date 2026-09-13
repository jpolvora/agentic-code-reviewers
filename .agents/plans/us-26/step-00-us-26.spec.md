---
id: 26
slug: us-26
title: "cursor-sdk: validate models dynamically via Cursor.models.list()"
source: github
specDate: 2026-09-04
issueState: open
issueUrl: "https://github.com/jpolvora/agentic-code-reviewers/issues/26"
step: 0
workflowId: us-26
status: active
startedAt: "2026-09-04T17:00:01.033Z"
endedAt: "2026-09-04T17:00:01.033Z"
acRefs: []
---
# Specification — cursor-sdk: validate models dynamically via Cursor.models.list()

## Description

Replace the hardcoded Cursor model allow-list for the `cursor-sdk` engine with runtime discovery via the Cursor SDK (`Cursor.models.list()`).

Current behavior: `src/engine/cursor-sdk/model.ts` defines `CursorReviewerModelId` enum plus `SUPPORTED_MODEL_IDS`, `isSupportedCursorReviewerModelId`, `assertSupportedCursorReviewerModelId`, and `resolveAgentModelSelection`. `src/config.ts` calls the assert at config parse time. Any model ID not in the enum (e.g. `gpt-5.6-luna-high`) is rejected before any SDK call, even when the authenticated Cursor account supports it. The enum comment already references `Cursor.models.list() → id`, but validation never calls it.

Target behavior:

- For engine `cursor-sdk` (aliases `cursor` / `cursor-sdk` resolve consistently), model availability is validated against the live catalog returned by `await Cursor.models.list()` at execution time for the authenticated account.
- The requested model identifier is preserved exactly when passed to the SDK (no normalization / remapping).
- Engine selection and model availability are validated independently: unknown engine → engine error; known engine + unknown model → unsupported-model error with requested ID and discovered IDs; catalog load failure (auth, network, API) → actionable catalog-failure error with no silent fallback to a stale or unrelated model.
- Engine providers share a common capability contract: all engines (`cursor-sdk`, `opencode`, future engines) expose the same programming interface to code against (`ExecutionEngine`), with per-engine model-validation implementations behind it. Capability parity is checked through the registry, not through per-engine `if` branches scattered in config/call sites.
- `opencode` and other engines keep their own engine-specific validation implementations behind the shared contract (format/shape checks stay engine-local; no Cursor catalog calls outside `cursor-sdk`).
- `--dry-run` stays review-only (no comments, commits, or product-file writes); model discovery may still occur to emit actionable diagnostics.
- No hardcoded Cursor model-ID list remains in runtime validation logic, source, or config. Default model selection is out of scope (do not change the default).

Touchpoints: `src/engine/types.ts` (extend `ExecutionEngine` capability contract — e.g. model `resolve`/`validate`/`list` capability), `src/engine/index.ts` (capability-based registry `getEngine` / alias map derived from registered implementations, replacing the static `switch`), `src/engine/cursor-sdk/model.ts` (remove enum/set allow-list, add async runtime validation via `Cursor.models.list()` behind the contract), `src/engine/cursor-sdk/engine.ts` (implement the model capability), `src/engine/opencode/model.ts` + `src/engine/opencode/engine.ts` (implement the same capability with the `provider/model` path, no catalog call), `src/config.ts` (decouple engine-alias parsing from model validation; accommodate async catalog lookup via the engine capability), `src/engine/cursor-sdk/stream.ts` (call site), tests for the cursor-sdk model path plus engine-parity tests, docs (`README.md`, `docs/`, `.env.example` if model vars change per repo doc-sync rule).

## Acceptance Criteria

- AC1: No hardcoded Cursor model-ID allow-list remains in runtime validation (no enum/set/literal list gating `cursor-sdk` model selection in source, config, or validation logic).
- AC2: `cursor-sdk` model validation calls `Cursor.models.list()` at runtime and validates the configured/requested model against the returned catalog for the authenticated account.
- AC3: Engine alias resolution (`cursor`, `cursor-sdk`) and engine selection validation are independent from model-availability validation.
- AC4: Tests mock `Cursor.models.list()` and cover: (a) available model passes and preserves the ID exactly, (b) unavailable model fails with unsupported-model error, (c) catalog API/auth/network failure fails with catalog-failure error and no fallback model, (d) non-Cursor engine (e.g. `opencode`) does not call `Cursor.models.list()` and keeps its own validation.
- AC5: Error messages distinguish invalid/unsupported model (includes requested ID + discovered IDs when available) from catalog-load failure (auth/network/API, actionable, no silent fallback).
- AC6: Existing dry-run and CI flows remain review-only (no comments/commits/product writes) while still emitting actionable model/catalog diagnostics.
- AC7: Documentation states that Cursor model availability depends on the authenticated account catalog (live `Cursor.models.list()`), not a static list.
- AC8: All engines implement a common capability contract (`ExecutionEngine` model capability): callers validate/resolve models through the abstraction, never by branching on engine names at call sites.
- AC9: Engine selection/alias validation is capability-based and derived from the registered engine implementations (registry map); adding a future engine requires only registering its implementation, with no static model list coupled to engine parsing.
- AC10: Each engine keeps its own model-validation implementation behind the contract (`cursor-sdk` → live `Cursor.models.list()` catalog; `opencode` → `provider/model` shape validation) with no cross-engine leakage and parity-tested error shapes (unsupported-model vs catalog/config failure).

## Original Issue Context

Original GitHub issue jpolvora/agentic-code-reviewers#26 (state: open, no labels, no assignees, no comments).

Title: `cursor-sdk: validate models dynamically via Cursor.models.list()`

Body (verbatim):

> ## Context
>
> The reviewer currently validates Cursor model IDs against a hardcoded allow-list. This becomes stale as the Cursor catalog evolves and can reject models that are available to the authenticated account.
>
> Observed with the current runner:
>
> - `gpt-5.6-luna-high` was rejected by `agentic-code-reviewers` before making the Cursor API call.
> - A related Cursor reviewer runner also rejected a newer Luna model for the same reason.
>
> ## Requested change
>
> For the `cursor` / `cursor-sdk` engine, replace the hardcoded model allow-list with runtime discovery through the Cursor SDK:
>
> ```ts
> const models = await Cursor.models.list();
> ```
>
> The requested model must be validated against the catalog returned by that API call at execution time. Do not maintain a hardcoded list of Cursor model IDs in source code, configuration, or validation logic.
>
> Engine validation should also be capability-based and derived from the registered engine implementations, rather than coupling a static model list to engine parsing. Existing aliases such as `cursor` and `cursor-sdk` should continue to resolve consistently.
>
> ## Expected behavior
>
> - Call `Cursor.models.list()` only for the Cursor SDK engine.
> - Validate the configured/requested model against the runtime catalog for the authenticated account.
> - Preserve the returned model identifier exactly when passing it to the SDK.
> - Fail with an actionable message when the catalog cannot be loaded (authentication, network, or API error); do not silently fall back to a stale or unrelated model.
> - Report a clear unsupported-model error including the requested ID and, when available, the runtime-discovered IDs.
> - Keep OpenCode and other engines on their own engine-specific validation paths.
> - Keep `--dry-run` review-only: model discovery may occur, but no comments, commits, or product-file writes should happen.
>
> ## Acceptance criteria
>
> - [ ] No hardcoded Cursor model-ID allow-list remains in runtime validation.
> - [ ] Cursor model validation uses `Cursor.models.list()` at runtime.
> - [ ] Engine aliases and engine selection are validated independently from model availability.
> - [ ] Tests mock `Cursor.models.list()` and cover: available model, unavailable model, API/auth failure, and non-Cursor engine behavior.
> - [ ] Error messages distinguish invalid model from model-catalog/API failure.
> - [ ] Existing dry-run and CI flows remain review-only and continue to emit actionable diagnostics.
> - [ ] Documentation explains that model availability depends on the authenticated Cursor account/catalog.
>
> ## Scope note
>
> This request is specifically about removing stale hardcoded model validation and making the Cursor SDK path follow the live API catalog. It does not require changing the model selected by default.

### Prior Work Sweep

Provider `sweep-prior-work` (`--issue 26`, keywords `Cursor.models.list`, `model`, `validation`, `cursor-sdk`):

- PR search for `#26`: 2 merged hits, both false positives on the literal `#26` token — PR #18 (`Enhance documentation and auto-fix functionality for reviewers`, head `develop`) and PR #13 (`refactor: update bot tagging and review thread handling`, head `develop`). Neither touches model validation.
- `git log` on inferred paths: no prior commits for the keywords (empty commit list).
- Code grep (`src/`): hardcoded list confirmed at `src/engine/cursor-sdk/model.ts:2-41` (`CursorReviewerModelId` enum + `SUPPORTED_MODEL_IDS`), asserted at `model.ts:52-60` and consumed at `model.ts:69` (`resolveAgentModelSelection`) and `src/config.ts:5,276`. Engine registration at `src/engine/types.ts:4` (`ReviewerEngineName = 'cursor-sdk' | 'opencode'`) and `src/engine/index.ts:18` (`case 'cursor-sdk'`). No existing `Cursor.models.list()` call site in runtime validation.
- Duplicate risk: low. No open PR for the same tracker id was found; proceed.

### Design Intent

`git log -p -S "assertSupportedCursorReviewerModelId"` shows the allow-list arrived in the initial commit (`8e5c2ec`) together with `src/config.ts` validation. It was an intentional fail-fast guard, not a deliberate coupling of engine parsing to a static model catalog — the staleness failure mode (`gpt-5.6-luna-high` rejected pre-API-call) is an accidental gap as the Cursor catalog evolved. Replacing it with live `Cursor.models.list()` validation preserves the original fail-fast intent while removing the stale coupling. Greenfield async catalog handling has no prior design constraint to preserve.

## Notes

- `Cursor.models.list()` shape: list entries expose `id`; preserve the matched ID byte-for-byte into the SDK agent/model selection.
- Async boundary: current `assertSupportedCursorReviewerModelId` is synchronous and called from config parsing — runtime catalog lookup is async, so the validation call site must move to execution time (engine/stream layer) or config must defer model validation.
- Catalog failure must be terminal and actionable (auth/network/API), never a fallback to `DEFAULT_CURSOR_REVIEWER_MODEL` or another ID.
- Keep `src/engine/opencode/model.ts` (`assertOpencodeModel`) independent; do not route non-Cursor engines through the Cursor catalog.
- Engine parity: extend `ExecutionEngine` with a minimal model capability (e.g. `resolveModel`/`validateModel` plus optional `listModels`), implement it per engine, and resolve engines through a registry (`engineName` + aliases) in `src/engine/index.ts`; `src/config.ts` `parseEngine`/`resolveReviewerModel` delegate to the registry instead of a static `switch` + per-engine asserts.
- Parity tests: same capability matrix for every registered engine (valid model resolves, invalid model → unsupported-model error shape, catalog/config failure → actionable failure, dry-run stays review-only); `cursor-sdk` cases mock `Cursor.models.list()`, `opencode` cases cover `provider/model` shape.
- Follow repo doc-sync rule: update `AGENTS.md` / `README.md` / `docs/` and `.env.example` if model/env behavior changes, with `npm test` coverage for the four mocked cases.
