## Summary
- Recover OpenCode reviews that finish with no usable `text` part (reasoning-only / output length / abort) by sending one in-session JSON follow-up before failing, with richer diagnostics.
- List all eligible files in the agent prompt (no 30-file `...` truncation) so models stop burning tokens reconstructing the file list.
- Fix Windows Git Bash `HOME` paths in `run.sh` `prepare_opencode` tests (`/c/...` instead of WSL `/mnt/c/...`).

## Test plan
- [x] `npm run build`
- [x] `npm test` (342 tests, 0 fail)
- [ ] Re-run workflow-skills Agentic Code Review CI against a large PR after this lands on `release`

