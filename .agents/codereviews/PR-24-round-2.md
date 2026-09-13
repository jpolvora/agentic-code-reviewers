# PR-24 review report — round 2

| Field | Value |
|-------|-------|
| PR | https://github.com/jpolvora/agentic-code-reviewers/pull/24 |
| Threads | PRRT_kwDOTGZdV86bZrm1, PRRT_kwDOTGZdV86bZrnG |
| Defect class | stripAgenticBotTags global-replaces product slug |

## Fix

- `src/bot-tag.ts`: strip first-line runner tags only; do not `replaceAll` the short slug.
- `test/bot-tag.test.ts`: body-preservation assertions for in-body `agentic-code-reviewers`.

## Sibling sweep

- `siblingsFixed`: helper in `src/bot-tag.ts` (callers github/review-context/autofix use it).
- `siblingsSkipped`: none.

## Verification

- `npm run build`: pass
- `npm test`: 347 tests, 0 fail, 4 skipped

## ws-code-review (this-round diff)

No Critical/Warning. Matches the thread proof: first-line tag strip, in-body slug kept.
