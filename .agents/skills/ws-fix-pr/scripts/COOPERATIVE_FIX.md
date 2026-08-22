# Cooperative Fix Contract (Auto-Fix ↔ fix-pr)

**Normative shared document** between:

| Runtime | Where it lives | Mode |
|---------|-----------|------|
| **Auto-Fix CI** | `AUTO_FIX.md` + `src/orchestrator/autofix-runner.ts` | `--auto-fix` / `auto-fix.yml` |
| **fix-pr IDE** | `SKILL.md` | Manual invocation `/fix-pr` |

These runtimes are **independent** (no code import or coupling). This contract aligns **gates**, **response format**, and **order of operations** for cross-reading PR threads.

---

## Principles (Karpathy + AGENTS.md)

1. **Think before coding** — understand root cause before editing.
2. **Simplicity first** — minimal code that resolves the issue; no adjacent refactoring.
3. **Surgical, class-wide** — touch only what the defect requires, but fix the **defect class**, not just the anchored `file:line`. Do not stop at the first reported instance.
4. **Tests when material** — run `npm test` (or stack equivalent) before committing when the fix touches executable logic.

## Sibling occurrence sweep (mandatory)

After analyzing a thread, name the defect class in one line (example: "gate claims JSON Schema validation but never reads the schema file"). Then search the repo for the same pattern before editing.

| Sweep | Do |
|-------|----|
| **Keywords** | Grep identifiers, log strings, untyped schema shapes, copied helpers, and sibling paths named in the thread |
| **Fix** | Apply the same correction to every in-scope hit in this round |
| **Exempt** | Leave a hit unfixed only with `path + reason` on the plan-gate and in the resolution comment |
| **Report** | List `siblingsFixed` and `siblingsSkipped` in the resolution body |

Do not close a thread whose description listed extra paths until those paths are fixed or explicitly exempted. Reviewer "similar occurrence" notes are extra search seeds, not a cap.

Always run these class greps even when the thread named one file:

| Defect class | Search |
|--------------|--------|
| Schema claim without loading the file | `Validated` / `against` `schema.json` vs actual `readFile`/`loadJsonSchema` of that path |
| Untyped arrays | `"type": "array"` with no `"items"` under `*.schema.json` |
| Untyped object items | `"items": { "type": "object" }` with no `properties` |
| Copied AC counters | `acTotal` / `acImplemented` writers outside `ac_counts.cjs` |
| Legacy dispatch key | `dispatched:` on `stepDispatches` vs writer `dispatchedAt` |

Aligns with [`ws-implement-tasks`](../../ws-implement-tasks/SKILL.md) Fix the Entire Defect Class.

---

## Thread Scope

| Runtime | Scope |
|---------|--------|
| **Auto-Fix CI** | **All** open review threads with file+line. Analyzes the full description of each. |
| **fix-pr IDE** | **All** open review threads in the PR |

Do not close a thread without a corresponding fix listed explicitly (`resolvedThreads` in Auto-Fix).

---

## Order of Operations (fix-pr IDE)

```
0. Verify local branch == PR head; git fetch + git pull <remote> <headRefName>
0b. If `gh` available: check `gh pr checks <PR_ID>` and in_progress runs for agentic-code-review.yml + agentic-auto-fix.yml; inform user (do not auto-block)
1. Fetch open threads (GraphQL via `node .agents/skills/ws-github-provider/scripts/fetch_threads.cjs`)
2. Deeply analyze each description; name the defect class
2b. Sibling sweep (repo-wide grep of the class; include paths the thread already named)
3. Apply surgical fixes for the class (anchored instance + siblings)
4. git add + local commit (`fix(#N): auto-fix issues from review threads [...])
5. Execute validation (build/test per stack)
6. Close each resolved thread via `node .agents/skills/ws-github-provider/scripts/resolve_thread.cjs` (`<!-- resolution-reply -->`)
7. git push — only if validation and attempted resolutions succeed
8. Wait for next review round; on new threads, restart from step 0
```

If step 5 or 6 fails: **do not push**. Local commit preserved for manual inspection.

## Order of Operations (Auto-Fix CI)

```
1. Fetch open threads (file+line)
2. Deeply analyze each description; name the defect class
2b. Sibling sweep across **all open-thread files plus paths named in those descriptions**
3. Apply surgical fixes for the class (anchored instance + siblings in scope)
4. git add + local commit (`fix(#N): auto-fix issues from review threads [...])
5. Execute validation build (`npm test` / `npm run build` or `AGENTIC_CODE_REVIEWERS_AUTO_FIX_BUILD_COMMAND`; failure = exit ≠ 0)
6. Close each resolved thread with a detailed comment (root cause + what changed)
7. git push — only if build and attempted resolutions succeed
8. Post detailed summary comment on PR (changed files, resolved threads with links, `<!-- auto-fix-summary -->`)
```

If step 5 or 6 fails: **do not push**. Local commit preserved for manual inspection.

**Sequential Dual-Engine (CI):** if a previous engine resolved threads but the push failed, the next engine attempts a **recovery push** of the pending local commit.

---

## Thread Response

All resolutions include the canonical marker:

```
<!-- resolution-reply -->
```

Body: **detailed explanation** from the agent (problem, root cause, change, why it resolves). Auto-Fix prefixes with `botTag` in the API.

---

## Structured Format (Auto-Fix Subagent)

JSON (see `AUTO_FIX.md`):

- `replacements[]` — modified intervals in the file.
- `resolvedThreads[]` — `{ threadId, explanation }` per closed thread.

---

## Intra-Review Context

| Field | Usage |
|-------|-----|
| `threadId` | API resolution |
| `filePath` | Anchored file |
| `lineNumber` | Review line |
| `description` | Full comment text (deep analysis) |
| `summary` | Short summary for reviewer tables |

---

## GitHub Token

`AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` → `GITHUB_TOKEN` → `GH_TOKEN`

PAT recommended for `resolveReviewThread`.
