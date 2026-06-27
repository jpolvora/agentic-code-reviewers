# Implementation Plan — PR #5 Review Threads

## Active issues (Round 1, OpenCode reviewer)

### 1. Undici Agent leak (`src/engine/opencode/fetch.ts`)

**Root cause:** `agentForTimeout` caches `undici.Agent` instances in a module-scoped `Map` keyed by `timeoutMs`. Agents are never closed, so connection pools persist for the process lifetime.

**Fix:**
- Export `closeAllOpencodeAgents()` that calls `agent.close()` on all cached agents and clears the map.
- Call it from the `finally` block in `runOpencodeStream` after session/server cleanup.

**Validation:** Unit test creates agents via `createOpencodeFetch`, calls `closeAllOpencodeAgents`, and verifies a subsequent fetch factory still works.

### 2. Fragile `globalThis.fetch` + double cast (`src/engine/opencode/fetch.ts`)

**Root cause:** `dispatcher` is an undici-specific option passed through `as unknown as RequestInit` to `globalThis.fetch`. A runtime that ignores `dispatcher` would silently drop custom timeouts.

**Fix:** Import and use `fetch as undiciFetch` from `undici` directly so `dispatcher` is always honored without type assertions.

**Validation:** Existing fetch tests updated; abort-signal isolation covered by `withAbortSignal` test (global fetch mock no longer applies).

## Out of scope (already resolved or outdated)

- AbortSignal propagation to `session.prompt` — fixed in prior commits; bot marked resolved.
- `isHeadersTimeoutError` only checking `cause` — already fixed with recursive detection in current code.

## Test plan

```bash
npm test
```
