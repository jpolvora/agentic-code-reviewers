/** Prefixo canônico de variáveis de ambiente do projeto. */
export const ENV_PREFIX = 'AGENTIC_CODE_REVIEWERS_' as const;

function primaryKey(suffix: string): string {
  return `${ENV_PREFIX}${suffix}`;
}

function readCredential(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Lê variável canônica `AGENTIC_CODE_REVIEWERS_*`. */
export function readEnv(suffix: string): string | undefined {
  const value = process.env[primaryKey(suffix)]?.trim();
  return value || undefined;
}

/** Nomes canônicos (para mensagens de erro, logs e metadados). */
export const ENV = {
  CURSOR_API_KEY: 'CURSOR_API_KEY',
  ENGINE: primaryKey('ENGINE'),
  MODEL: primaryKey('MODEL'),
  OPENCODE_URL: primaryKey('OPENCODE_URL'),
  OPENCODE_HOSTNAME: primaryKey('OPENCODE_HOSTNAME'),
  OPENCODE_PORT: primaryKey('OPENCODE_PORT'),
  OPENCODE_AGENT: primaryKey('OPENCODE_AGENT'),
  OPENCODE_SERVER_LOG: primaryKey('OPENCODE_SERVER_LOG'),
  OPENCODE_LOG_LEVEL: primaryKey('OPENCODE_LOG_LEVEL'),
  OPENCODE_KILL_PORT: primaryKey('OPENCODE_KILL_PORT'),
  OPENCODE_STREAM_REASONING: primaryKey('OPENCODE_STREAM_REASONING'),
  OPENCODE_BIN: primaryKey('OPENCODE_BIN'),
  /** Credencial OpenCode Go — lida por `run.sh`/CI, não por `env.*`. */
  OPENCODE_API_KEY: 'OPENCODE_API_KEY',
  AZURE_DEVOPS_PAT: primaryKey('AZURE_DEVOPS_PAT'),
  GITHUB_TOKEN: primaryKey('GITHUB_TOKEN'),
  TARGET_BRANCH: primaryKey('TARGET_BRANCH'),
  SCORE_MIN: primaryKey('SCORE_MIN'),
  TIMEOUT_MS: primaryKey('TIMEOUT_MS'),
  SANDBOX: primaryKey('SANDBOX'),
  REPO_ROOT: primaryKey('REPO_ROOT'),
  REVIEW_SELF: primaryKey('REVIEW_SELF'),
  STACK: primaryKey('STACK'),
  CUSTOM_PROMPT: primaryKey('CUSTOM_PROMPT'),
  INCLUDE_PATTERNS: primaryKey('INCLUDE_PATTERNS'),
  VERBOSE: primaryKey('VERBOSE'),
  DRY_RUN: primaryKey('DRY_RUN'),
  SEED_TEST: primaryKey('SEED_TEST'),
  INCLUDE_UNCOMMITTED: primaryKey('INCLUDE_UNCOMMITTED'),
  MAX_ROUNDS: primaryKey('MAX_ROUNDS'),
  EXTRA_EXCLUDE_PATTERNS: primaryKey('EXTRA_EXCLUDE_PATTERNS'),
  SAFE_OUTPUTS: primaryKey('SAFE_OUTPUTS'),
  PROTECTED_PATTERNS: primaryKey('PROTECTED_PATTERNS'),
  MAX_COMMENT_CHARS: primaryKey('MAX_COMMENT_CHARS'),
  REQUIRE_DIFF_LINE: primaryKey('REQUIRE_DIFF_LINE'),
  PROMPT_MODULES: primaryKey('PROMPT_MODULES'),
  MCP_ENABLED: primaryKey('MCP_ENABLED'),
  MCP_TOOLS: primaryKey('MCP_TOOLS'),
  MCP_LINT_CMD: primaryKey('MCP_LINT_CMD'),
  MCP_TEST_CMD: primaryKey('MCP_TEST_CMD'),
  PARALLEL_CHUNKS: primaryKey('PARALLEL_CHUNKS'),
  META_REVIEWER: primaryKey('META_REVIEWER'),
  PR_ID: primaryKey('PR_ID'),
  ADO_ORG: primaryKey('ADO_ORG'),
  ADO_PROJECT: primaryKey('ADO_PROJECT'),
  ADO_REPO: primaryKey('ADO_REPO'),
  PROMPT_COLOR: primaryKey('PROMPT_COLOR'),
  AUTO_FIX: primaryKey('AUTO_FIX'),
  AUTO_FIX_BUILD_COMMAND: primaryKey('AUTO_FIX_BUILD_COMMAND'),
} as const;

/** Leitores tipados — preferir estes em vez de `process.env` direto. */
export const env = {
  cursorApiKey: () => readCredential(ENV.CURSOR_API_KEY),
  engine: () => readEnv('ENGINE'),
  model: () => readEnv('MODEL'),
  opencodeUrl: () => readEnv('OPENCODE_URL'),
  opencodeHostname: () => readEnv('OPENCODE_HOSTNAME'),
  opencodePort: () => readEnv('OPENCODE_PORT'),
  opencodeAgent: () => readEnv('OPENCODE_AGENT'),
  opencodeServerLog: () => readEnv('OPENCODE_SERVER_LOG'),
  opencodeLogLevel: () => readEnv('OPENCODE_LOG_LEVEL'),
  opencodeKillPort: () => readEnv('OPENCODE_KILL_PORT'),
  opencodeStreamReasoning: () => readEnv('OPENCODE_STREAM_REASONING'),
  opencodeBin: () => readEnv('OPENCODE_BIN'),
  azureDevOpsPat: () => readEnv('AZURE_DEVOPS_PAT'),
  githubToken: () =>
    readEnv('GITHUB_TOKEN') ??
    readCredential('GITHUB_TOKEN') ??
    readCredential('GH_TOKEN'),
  targetBranch: () => readEnv('TARGET_BRANCH'),
  scoreMin: () => readEnv('SCORE_MIN'),
  timeoutMs: () => readEnv('TIMEOUT_MS'),
  sandbox: () => readEnv('SANDBOX'),
  repoRoot: () => readEnv('REPO_ROOT'),
  reviewSelf: () => readEnv('REVIEW_SELF'),
  stack: () => readEnv('STACK'),
  customPrompt: () => readEnv('CUSTOM_PROMPT'),
  includePatterns: () => readEnv('INCLUDE_PATTERNS'),
  verbose: () => readEnv('VERBOSE'),
  dryRun: () => readEnv('DRY_RUN'),
  seedTest: () => readEnv('SEED_TEST'),
  includeUncommitted: () => readEnv('INCLUDE_UNCOMMITTED'),
  maxRounds: () => readEnv('MAX_ROUNDS'),
  extraExcludePatterns: () => readEnv('EXTRA_EXCLUDE_PATTERNS'),
  safeOutputs: () => readEnv('SAFE_OUTPUTS'),
  protectedPatterns: () => readEnv('PROTECTED_PATTERNS'),
  maxCommentChars: () => readEnv('MAX_COMMENT_CHARS'),
  requireDiffLine: () => readEnv('REQUIRE_DIFF_LINE'),
  promptModules: () => readEnv('PROMPT_MODULES'),
  mcpEnabled: () => readEnv('MCP_ENABLED'),
  mcpTools: () => readEnv('MCP_TOOLS'),
  mcpLintCmd: () => readEnv('MCP_LINT_CMD'),
  mcpTestCmd: () => readEnv('MCP_TEST_CMD'),
  parallelChunks: () => readEnv('PARALLEL_CHUNKS'),
  metaReviewer: () => readEnv('META_REVIEWER'),
  prId: () => readEnv('PR_ID'),
  adoOrg: () => readEnv('ADO_ORG'),
  adoProject: () => readEnv('ADO_PROJECT'),
  adoRepo: () => readEnv('ADO_REPO'),
  promptColor: () => readEnv('PROMPT_COLOR'),
  autoFix: () => readEnv('AUTO_FIX'),
  autoFixBuildCommand: () => readEnv('AUTO_FIX_BUILD_COMMAND'),
} as const;
