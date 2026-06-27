# Auto-Fix Feature Plan

This plan details the architecture and flow for the new `--auto-fix` flag in `agentic-code-reviewers`. As requested, this focuses on the `agentic-code-reviewers` orchestrator side, leaving pipeline orchestration (the sequence of `review` -> `auto-fix` -> `review`) to the CI/CD environment.

## Open Questions (Grill-Me)

1. **Subagent Concurrency & File Collisions:** The requirements specify "dispatch subagents to resolve in parallel each thread". If multiple threads point to the exact same file, parallel fixes could overwrite each other or create conflicts. 
   - *Recommendation:* Group active threads by file (or file-dependency tree) and dispatch one subagent *per file* (or pass all threads for a file to a single agent), rather than strictly one subagent per thread. Do you agree?
2. **Git Commit & Push Mechanism:** To consolidate the changes, the runner will need to execute git commands.
   - *Recommendation:* We can use Node's `child_process.execSync` to run `git add .`, `git commit -m "Auto-fix from agentic-code-reviewers"`, and `git push origin <branch>`. Is the CI environment guaranteed to have git configured with the necessary push permissions, or do we need to inject the PAT/Token into the git remote URL within the runner?
3. **Agent Fix Format:** How should the agent output the file changes?
   - *Recommendation:* The most deterministic approach for the SDK engines (Cursor/OpenCode) is to ask for a JSON payload containing `[{ "file": "path", "startLine": X, "endLine": Y, "replacement": "..." }]` or simply the complete replacement for a function block, similar to the existing `suggestedFix` but expanded to multiple files if necessary. 
4. **Thread Resolution Strategy:** Once the push is made, we must comment on the threads to explain the fix and mark them as resolved.
   - *Recommendation:* The subagent prompt should require returning an `explanation` field for each fixed thread. The orchestrator will then use the existing `provider.resolvePullRequestReviewThreads` and `provider.setPullRequestComments` to reply to the threads.

## Proposed Changes

### `src/config.ts`

- Add `autoFix: boolean` to `ReviewerConfig` and `CliArgs`.
- Parse `--auto-fix` and `AGENTIC_CODE_REVIEWERS_AUTO_FIX`.
- Add validation to ensure `--auto-fix` is mutually exclusive with standard code review execution (though they are just different branches of logic).

### `src/index.ts`

- Introduce the branching logic right after collecting PR context:
  ```typescript
  if (config.autoFix) {
    await runAutoFixFlow(config, reviewContext, logger);
    return;
  }
  // Existing review flow...
  ```

### `src/orchestrator/autofix-runner.ts`

- **Filter Threads:** Retrieve only the `activeThreads` (threads that are open).
- **Batching:** Group threads by file to prevent parallel write conflicts.
- **Execution:** Map over grouped threads and execute `ExecutionEngine` queries in parallel.
- **Prompting:** Inject a new `AUTO_FIX_PROMPT.md` that instructs the agent to act as a developer, providing surgical fixes for the issues raised in the threads.
- **Apply Fixes:** Parse the LLM responses (JSON diffs or file blocks) and use `fs.writeFileSync` to apply them to the local workspace.

### `src/git/autofix-commit.ts`

- A utility function to stage, commit, and push changes.
- `git commit -m "style(agent): apply auto-fixes for active review threads"`
- `git push origin HEAD`

### `src/provider/` (GitHub & Azure DevOps)

- Ensure there are methods to reply to existing threads with an explanation and to mark them as `RESOLVED`. Currently, we resolve threads based on developer commits. In auto-fix mode, the bot itself resolves the thread *after* pushing the fix.

### `skills/AUTO_FIX.md`

- The runtime system prompt defining the JSON contract for the subagent fixes (e.g., lines to replace, explanation for the thread).
