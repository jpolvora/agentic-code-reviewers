## Summary
- Harden `parseAgentReviewOutput` so nested `suggestedFix` code fences and invalid LLM escapes (`\``, `\.`, `\:`) no longer fatal-fail consumer CI.
- Brace-balanced fence extraction + `fixInvalidJsonEscapes`; regression tests and docs (`faq`, `flow-analysis`).
- Also ships pending `develop` work already ahead of `main` (workflow-skills 0.3.30 dogfood hub, OpenCode empty-text recovery, bot-tag / review-thread fixes).

## Test plan
- [x] `bash .agents/skills/ws-ship-pr/scripts/verify.sh` (`VERIFY_OK`, 345 tests pass)
- [x] Parser unit tests for nested fences + invalid escapes
- [ ] CI matrix on this PR (cursor-sdk / opencode review jobs)
- [ ] After merge to `main`, confirm `release` branch rebuild so workflow-skills consumers pick up the parser fix
