/**
 * Glob patterns injected into the embedded OpenCode server config (`instructions`).
 * Mirrors cursor-sdk `settingSources: ['project']` — see skills/CODE_REVIEW.md.
 */
export declare const OPENCODE_RUNNER_HARNESS_INSTRUCTIONS: readonly ["AGENTS.md", ".opencode/AGENTS.md", ".cursor/rules/*.mdc", ".cursor/rules/*.md", ".agents/skills/code-review/SKILL.md", "docs/**/*.md"];
export declare function resolveOpencodeHarnessInstructions(): readonly string[];
//# sourceMappingURL=harness-instructions.d.ts.map