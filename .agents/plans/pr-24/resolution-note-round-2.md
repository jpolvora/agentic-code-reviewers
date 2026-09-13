stripAgenticBotTags now removes only the first-line runner tag (current, Agentic Code Reviewer {engine}, or [Cursor Reviewer]). In-body mentions of agentic-code-reviewers are preserved for auto-fix and summary dedup.

siblingsFixed:
- src/bot-tag.ts (single helper used by github.ts, review-context.ts, autofix-runner.ts)
- test/bot-tag.test.ts (body-preservation cases)

siblingsSkipped: none
