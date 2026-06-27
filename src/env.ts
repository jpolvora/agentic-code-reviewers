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
  OPENCODE_API_KEY: 'OPENCODE_API_KEY',
  AZURE_DEVOPS_PAT: primaryKey('AZURE_DEVOPS_PAT'),
  GITHUB_TOKEN: primaryKey('GITHUB_TOKEN'),
  TARGET_BRANCH: primaryKey('TARGET_BRANCH'),
  BOT_TAG: primaryKey('BOT_TAG'),
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
  PR_ID: primaryKey('PR_ID'),
  ADO_ORG: primaryKey('ADO_ORG'),
  ADO_PROJECT: primaryKey('ADO_PROJECT'),
  ADO_REPO: primaryKey('ADO_REPO'),
  REPO_URL: primaryKey('REPO_URL'),
  PROMPT_COLOR: primaryKey('PROMPT_COLOR'),
  EXECUTION_MODE: primaryKey('EXECUTION_MODE'),
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
  opencodeApiKey: () => readCredential(ENV.OPENCODE_API_KEY),
  azureDevOpsPat: () => readEnv('AZURE_DEVOPS_PAT'),
  githubToken: () => readEnv('GITHUB_TOKEN'),
  targetBranch: () => readEnv('TARGET_BRANCH'),
  botTag: () => readEnv('BOT_TAG'),
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
  prId: () => readEnv('PR_ID'),
  adoOrg: () => readEnv('ADO_ORG'),
  adoProject: () => readEnv('ADO_PROJECT'),
  adoRepo: () => readEnv('ADO_REPO'),
  repoUrl: () => readEnv('REPO_URL'),
  promptColor: () => readEnv('PROMPT_COLOR'),
  executionMode: () => readEnv('EXECUTION_MODE'),
} as const;
