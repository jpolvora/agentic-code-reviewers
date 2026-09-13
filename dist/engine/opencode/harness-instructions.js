/**
 * Glob patterns injected into the embedded OpenCode server config (`instructions`).
 * Mirrors cursor-sdk `settingSources: ['project']` — see skills/CODE_REVIEW.md.
 */
export const OPENCODE_RUNNER_HARNESS_INSTRUCTIONS = [
    'AGENTS.md',
    '.opencode/AGENTS.md',
    '.cursor/rules/*.mdc',
    '.cursor/rules/*.md',
    '.agents/skills/code-review/SKILL.md',
    'docs/**/*.md',
];
export function resolveOpencodeHarnessInstructions() {
    return OPENCODE_RUNNER_HARNESS_INSTRUCTIONS;
}
//# sourceMappingURL=harness-instructions.js.map