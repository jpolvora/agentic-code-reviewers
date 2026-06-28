# Cooperative Fix Contract (Auto-Fix ↔ solve-pr)

**Normative shared document** between:

| Runtime | Where it lives | Mode |
|---------|-----------|------|
| **Auto-Fix CI** | `skills/AUTO_FIX.md` + `src/orchestrator/autofix-runner.ts` | `--auto-fix` / `auto-fix.yml` |
| **solve-pr IDE** | `.agents/skills/solve-pr/SKILL.md` | Manual invocation `/solve-pr` |

These runtimes are **independent** (no code import or coupling). This contract aligns **gates**, **response format**, and **order of operations** for cross-reading PR threads.

---

## Principles (Karpathy + AGENTS.md)

1. **Think before coding** — understand root cause before editing.
2. **Simplicity first** — minimal code that resolves the issue; no adjacent refactoring.
3. **Surgical changes** — only lines traceable to the thread's issue.
4. **Tests when material** — run `npm test` (or stack equivalent) before committing when the fix touches executable logic.

---

## Thread Scope

| Runtime | Scope |
|---------|--------|
| **Auto-Fix CI** | **All** open review threads with file+line. Analyzes the full description of each. |
| **solve-pr IDE** | **All** open review threads in the PR |

Do not close a thread without a corresponding fix listed explicitly (`resolvedThreads` in Auto-Fix).

---

## Order of Operations (Auto-Fix CI)

```
1. Fetch open threads (file+line)
2. Deeply analyze each description
3. Apply surgical fixes
4. git add + local commit
5. Execute validation build (`npm test` / `npm run build` or `AGENTIC_CODE_REVIEWERS_AUTO_FIX_BUILD_COMMAND`; failure = exit ≠ 0)
6. Close each resolved thread with a detailed comment (root cause + what changed)
7. git push — only if build and attempted resolutions succeed
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

JSON (`AUTO_FIX.md`):

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
