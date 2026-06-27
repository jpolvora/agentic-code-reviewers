/** Prefixo canônico de variáveis de ambiente do projeto. */
export const ENV_PREFIX = 'AGENTIC_CODE_REVIEWERS_' as const;

function primaryKey(suffix: string): string {
  return `${ENV_PREFIX}${suffix}`;
}

/**
 * Lê variável canônica `AGENTIC_CODE_REVIEWERS_*` com fallback opcional a nomes legados (deprecated).
 */
export function readEnv(suffix: string, ...legacyKeys: string[]): string | undefined {
  const primary = process.env[primaryKey(suffix)]?.trim();
  if (primary) return primary;

  for (const legacy of legacyKeys) {
    const value = process.env[legacy]?.trim();
    if (value) return value;
  }

  return undefined;
}

/** Nomes canônicos (para mensagens de erro, logs e metadados). */
export const ENV = {
  CURSOR_API_KEY: primaryKey('CURSOR_API_KEY'),
  ENGINE: primaryKey('ENGINE'),
  MODEL: primaryKey('MODEL'),
  OPENCODE_URL: primaryKey('OPENCODE_URL'),
  OPENCODE_HOSTNAME: primaryKey('OPENCODE_HOSTNAME'),
  OPENCODE_PORT: primaryKey('OPENCODE_PORT'),
  OPENCODE_AGENT: primaryKey('OPENCODE_AGENT'),
  OPENCODE_GO_API_KEY: primaryKey('OPENCODE_GO_API_KEY'),
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
  cursorApiKey: () => readEnv('CURSOR_API_KEY', 'CURSOR_API_KEY'),
  engine: () => readEnv('ENGINE', 'CURSOR_REVIEWER_ENGINE'),
  model: () => readEnv('MODEL', 'CURSOR_REVIEWER_MODEL'),
  opencodeUrl: () => readEnv('OPENCODE_URL', 'CURSOR_REVIEWER_OPENCODE_URL', 'OPENCODE_SERVER_URL'),
  opencodeHostname: () => readEnv('OPENCODE_HOSTNAME', 'CURSOR_REVIEWER_OPENCODE_HOSTNAME'),
  opencodePort: () => readEnv('OPENCODE_PORT', 'CURSOR_REVIEWER_OPENCODE_PORT'),
  opencodeAgent: () => readEnv('OPENCODE_AGENT', 'CURSOR_REVIEWER_OPENCODE_AGENT'),
  opencodeGoApiKey: () => readEnv('OPENCODE_GO_API_KEY', 'OPENCODE_GO_API_KEY'),
  azureDevOpsPat: () => readEnv('AZURE_DEVOPS_PAT', 'AZURE_DEVOPS_EXT_PAT'),
  githubToken: () => readEnv('GITHUB_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN'),
  targetBranch: () => readEnv('TARGET_BRANCH', 'CURSOR_REVIEWER_TARGET_BRANCH'),
  botTag: () => readEnv('BOT_TAG', 'CURSOR_REVIEWER_BOT_TAG'),
  scoreMin: () => readEnv('SCORE_MIN', 'SCORE_MIN'),
  timeoutMs: () => readEnv('TIMEOUT_MS', 'CURSOR_REVIEWER_TIMEOUT_MS'),
  sandbox: () => readEnv('SANDBOX', 'CURSOR_REVIEWER_SANDBOX'),
  repoRoot: () => readEnv('REPO_ROOT', 'CURSOR_REVIEWER_REPO_ROOT'),
  reviewSelf: () => readEnv('REVIEW_SELF', 'CURSOR_REVIEWER_REVIEW_SELF'),
  stack: () => readEnv('STACK', 'CURSOR_REVIEWER_STACK'),
  customPrompt: () => readEnv('CUSTOM_PROMPT', 'CURSOR_REVIEWER_CUSTOM_PROMPT'),
  includePatterns: () => readEnv('INCLUDE_PATTERNS', 'CURSOR_REVIEWER_INCLUDE_PATTERNS'),
  verbose: () => readEnv('VERBOSE', 'CURSOR_REVIEWER_VERBOSE'),
  dryRun: () => readEnv('DRY_RUN', 'CURSOR_REVIEWER_DRY_RUN'),
  seedTest: () => readEnv('SEED_TEST', 'CURSOR_REVIEWER_SEED_TEST'),
  includeUncommitted: () => readEnv('INCLUDE_UNCOMMITTED', 'CURSOR_REVIEWER_INCLUDE_UNCOMMITTED'),
  maxRounds: () => readEnv('MAX_ROUNDS', 'CURSOR_REVIEWER_MAX_ROUNDS'),
  extraExcludePatterns: () => readEnv('EXTRA_EXCLUDE_PATTERNS', 'CURSOR_REVIEWER_EXTRA_EXCLUDE_PATTERNS'),
  prId: () => readEnv('PR_ID', 'CURSOR_REVIEWER_PR_ID'),
  adoOrg: () => readEnv('ADO_ORG', 'CURSOR_REVIEWER_ADO_ORG'),
  adoProject: () => readEnv('ADO_PROJECT', 'CURSOR_REVIEWER_ADO_PROJECT'),
  adoRepo: () => readEnv('ADO_REPO', 'CURSOR_REVIEWER_ADO_REPO'),
  repoUrl: () => readEnv('REPO_URL', 'CURSOR_REVIEWER_REPO_URL'),
  promptColor: () => readEnv('PROMPT_COLOR', 'CURSOR_REVIEWER_PROMPT_COLOR'),
  executionMode: () => readEnv('EXECUTION_MODE', 'REVIEWER_EXECUTION_MODE'),
} as const;
