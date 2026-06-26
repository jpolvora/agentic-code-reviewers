import { resolve, relative, isAbsolute } from 'node:path';
import { existsSync, readFileSync, realpathSync, readdirSync } from 'node:fs';
import {
  assertSupportedCursorReviewerModelId,
  DEFAULT_CURSOR_REVIEWER_MODEL,
} from './engine/cursor-sdk/model.js';
import { assertOpencodeModel, DEFAULT_OPENCODE_MODEL } from './engine/opencode/model.js';
import type { ReviewerEngineName } from './engine/types.js';
import { detectSourceBranchRef } from './git/diff.js';
import { ProjectValidationError, resolveProject } from './project.js';

export interface StackConfig {
  name: string;
  includePatterns: string[];
  promptFileName: string;
}

export const STACKS: Record<string, StackConfig> = {
  'abp/angular': {
    name: 'ABP/Angular',
    includePatterns: ['**/*.cs', '**/*.ts', '**/*.html', '*.cs', '*.ts', '*.html'],
    promptFileName: 'abp-angular.md',
  },
  'php/laravel': {
    name: 'PHP/Laravel',
    includePatterns: [
      '**/*.php',
      '**/*.js',
      '**/*.ts',
      '**/*.vue',
      '**/*.html',
      '**/*.css',
      '**/*.json',
      '*.php',
      '*.js',
      '*.ts',
      '*.vue',
      '*.html',
      '*.css',
      '*.json',
    ],
    promptFileName: 'php-laravel.md',
  },
  'nextjs/react': {
    name: 'Next.js/React',
    includePatterns: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx',
      '**/*.html',
      '**/*.css',
      '**/*.json',
      '*.ts',
      '*.tsx',
      '*.js',
      '*.jsx',
      '*.html',
      '*.css',
      '*.json',
    ],
    promptFileName: 'nextjs-react.md',
  },
  'typescript': {
    name: 'TypeScript',
    includePatterns: ['**/*.ts', '**/*.tsx', '**/*.json', '*.ts', '*.tsx', '*.json'],
    promptFileName: 'typescript.md',
  },
};

export function getStackConfig(stackName: string): StackConfig | undefined {
  const normalized = stackName.trim().toLowerCase();
  if (normalized === 'abp/angular' || normalized === 'abp-angular' || normalized === 'abpangular') {
    return STACKS['abp/angular'];
  }
  if (normalized === 'php/laravel' || normalized === 'php-laravel' || normalized === 'phplaravel') {
    return STACKS['php/laravel'];
  }
  if (normalized === 'nextjs/react' || normalized === 'nextjs-react' || normalized === 'nextjs' || normalized === 'react' || normalized === 'next.js/react' || normalized === 'next.js-react') {
    return STACKS['nextjs/react'];
  }
  if (normalized === 'typescript' || normalized === 'ts') {
    return STACKS['typescript'];
  }
  if (normalized === 'custom') {
    return {
      name: 'Custom',
      includePatterns: DEFAULT_INCLUDE,
      promptFileName: '',
    };
  }
  return undefined;
}

export function detectStack(repoRoot: string): string | undefined {
  try {
    // 1. Check Laravel/PHP
    if (existsSync(resolve(repoRoot, 'artisan')) || existsSync(resolve(repoRoot, 'composer.json'))) {
      return 'PHP/Laravel';
    }

    // Read package.json if exists to inspect dependencies
    const pkgPath = resolve(repoRoot, 'package.json');
    let isAngular = false;
    let isNext = false;
    let isTs = false;

    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };

        isAngular = '@angular/core' in deps;
        isNext = 'next' in deps;
        isTs = 'typescript' in deps || 'tsx' in deps;
      } catch {
        // ignore
      }
    }

    // 2. Check Next.js/React
    if (
      isNext ||
      existsSync(resolve(repoRoot, 'next.config.js')) ||
      existsSync(resolve(repoRoot, 'next.config.mjs')) ||
      existsSync(resolve(repoRoot, 'next.config.ts'))
    ) {
      return 'Next.js/React';
    }

    // 3. Check ABP/Angular
    if (
      isAngular ||
      existsSync(resolve(repoRoot, 'angular.json')) ||
      existsSync(resolve(repoRoot, 'angular')) ||
      existsSync(resolve(repoRoot, 'src', 'frontend'))
    ) {
      return 'ABP/Angular';
    }

    // 4. Check C# / Solution files (check before generic tsconfig.json)
    const files = readdirSync(repoRoot);
    if (files.some((f) => f.endsWith('.sln') || f.endsWith('.csproj'))) {
      return 'ABP/Angular';
    }

    // 5. Check TypeScript
    if (isTs || existsSync(resolve(repoRoot, 'tsconfig.json'))) {
      return 'TypeScript';
    }
  } catch {
    // ignore filesystem errors
  }

  return undefined;
}

export interface ReviewerConfig {
  repoRoot: string;
  cursorApiKey: string;
  /** Engine de execução LLM (default: cursor-sdk). */
  engine: ReviewerEngineName;
  model: string;
  botTag: string;
  verbose: boolean;
  dryRun: boolean;
  includeUncommitted: boolean;
  seedTest: boolean;

  sourceBranch: string;
  targetBranch: string;

  provider: 'azuredevops' | 'github';

  organization: string;
  project: string;
  repositoryName: string;
  pullRequestId: number;
  /** Origem do ID da PR: `--pr-id`, `SYSTEM_PULLREQUEST_PULLREQUESTID`, etc. */
  pullRequestIdSource: string;

  adoAccessToken: string;

  includePatterns: string[];
  excludePatterns: string[];

  skillPath: string;
  systemPromptPath: string;
  projectName: string;
  version: string;

  /** Orçamento de rodadas fix→review antes de escalar para revisão humana (0 desabilita). */
  maxRounds: number;
  /** Score mínimo (inclusive) para publicar issue como thread na PR. */
  scoreMin: number;
  stack: string;
  stackPromptPath: string | null;
  stackSource: 'cli' | 'env' | 'detected' | 'fallback';
  customPromptContent?: string;
}

export interface CliArgs {
  dryRun?: boolean;
  verbose?: boolean;
  sourceBranch?: string;
  targetBranch?: string;
  organization?: string;
  project?: string;
  repository?: string;
  pullRequestId?: number;
  botTag?: string;
  model?: string;
  repoRoot?: string;
  includeUncommitted?: boolean;
  seedTest?: boolean;
  help?: boolean;
  ado?: boolean;
  gh?: boolean;
  stack?: string;
  customPrompt?: string;
  includePatterns?: string;
  scoreMin?: number;
}

const DEFAULT_INCLUDE = ['**/*.cs', '**/*.ts', '**/*.html', '*.cs', '*.ts', '*.html'];
const DEFAULT_MODEL = DEFAULT_CURSOR_REVIEWER_MODEL;

const BASE_EXCLUDE = ['*/proxy/*', '*/bin/*', '*/obj/*', '*.md', '*.csproj', 'secret.txt'];

const DEFAULT_MAX_ROUNDS = 5;
const DEFAULT_ENGINE: ReviewerEngineName = 'cursor-sdk';
const DEFAULT_SCORE_MIN = 6;
const MAX_SCORE_MIN = 10;

function parseEngine(value: string | undefined): ReviewerEngineName {
  const trimmed = value?.trim().toLowerCase() ?? '';
  if (!trimmed || trimmed === 'cursor-sdk' || trimmed === 'cursor') {
    return 'cursor-sdk';
  }
  if (trimmed === 'opencode') {
    return 'opencode';
  }
  throw new Error(`Engine inválido: "${value}". Valores aceitos: cursor-sdk, opencode`);
}

function resolveReviewerModel(engine: ReviewerEngineName, cliModel?: string): string {
  const raw = resolveOptionalEnv(
    cliModel ?? process.env.CURSOR_REVIEWER_MODEL,
    engine === 'opencode' ? DEFAULT_OPENCODE_MODEL : DEFAULT_MODEL,
  );
  return engine === 'opencode' ? assertOpencodeModel(raw) : assertSupportedCursorReviewerModelId(raw);
}

/** Lê um inteiro 0–10 de env/CLI; usa fallback se ausente, inválido ou macro ADO. */
export function parseScoreMin(value: string | number | undefined, fallback: number = DEFAULT_SCORE_MIN): number {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= MAX_SCORE_MIN ? value : fallback;
  }
  const trimmed = value?.trim() ?? '';
  if (!trimmed || isUnexpandedPipelineMacro(trimmed)) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_SCORE_MIN ? parsed : fallback;
}

/** Lê um inteiro >= 0 de env; usa fallback se ausente, inválido ou macro ADO. */
function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || isUnexpandedPipelineMacro(trimmed)) {
    return fallback;
  }
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseCsvPatterns(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function resolveExcludePatterns(repoRoot: string, runnerRoot: string): string[] {
  const patterns = [...BASE_EXCLUDE];

  const reviewSelf = parseBool(process.env.CURSOR_REVIEWER_REVIEW_SELF, false);
  if (!reviewSelf) {
    const relPath = relative(repoRoot, runnerRoot);
    if (relPath && !relPath.startsWith('..') && !isAbsolute(relPath)) {
      const normalized = relPath.replace(/\\/g, '/');
      patterns.push(`${normalized}/**`);
    } else {
      patterns.push('scripts/cursor-reviewer/**');
    }
  }

  patterns.push(...parseCsvPatterns(process.env.CURSOR_REVIEWER_EXTRA_EXCLUDE_PATTERNS));

  return patterns;
}

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

/** Macro ADO literal quando a variável não existe no variable group / pipeline. */
export function isUnexpandedPipelineMacro(value: string): boolean {
  return /^\$\([A-Za-z0-9_.]+\)$/.test(value.trim());
}

function resolveOptionalEnv(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || isUnexpandedPipelineMacro(trimmed)) {
    return fallback;
  }
  return trimmed;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg.startsWith('--stack=')) {
      args.stack = arg.slice(8);
      continue;
    }
    if (arg.startsWith('--custom-prompt=')) {
      args.customPrompt = arg.slice(16);
      continue;
    }
    if (arg.startsWith('--include-patterns=')) {
      args.includePatterns = arg.slice(19);
      continue;
    }
    if (arg.startsWith('--score-min=')) {
      args.scoreMin = Number(arg.slice(12));
      continue;
    }

    switch (arg) {
      case '--help':
      case '-h':
        args.help = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--quiet':
        args.verbose = false;
        break;
      case '--source-branch':
        args.sourceBranch = next;
        i++;
        break;
      case '--target-branch':
        args.targetBranch = next;
        i++;
        break;
      case '--org':
        args.organization = next;
        i++;
        break;
      case '--project':
        args.project = next;
        i++;
        break;
      case '--repo':
        args.repository = next;
        i++;
        break;
      case '--pr-id':
        args.pullRequestId = Number(next);
        i++;
        break;
      case '--bot-tag':
        args.botTag = next;
        i++;
        break;
      case '--model':
        args.model = next;
        i++;
        break;
      case '--repo-root':
        args.repoRoot = next;
        i++;
        break;
      case '--include-uncommitted':
        args.includeUncommitted = true;
        break;
      case '--seed-test':
        args.seedTest = true;
        break;
      case '--ado':
        args.ado = true;
        break;
      case '--gh':
        args.gh = true;
        break;
      case '--stack':
        args.stack = next;
        i++;
        break;
      case '--custom-prompt':
        args.customPrompt = next;
        i++;
        break;
      case '--include-patterns':
        args.includePatterns = next;
        i++;
        break;
      case '--score-min':
        args.scoreMin = Number(next);
        i++;
        break;
      default:
        break;
    }
  }

  return args;
}

function extractOrgFromCollectionUri(uri: string): string {
  const trimmed = uri.replace(/\/$/, '');
  if (!trimmed) {
    return '';
  }

  // URL legada: https://{org}.visualstudio.com
  const legacyMatch = trimmed.match(/^https?:\/\/([^.]+)\.visualstudio\.com/i);
  if (legacyMatch) {
    return legacyMatch[1];
  }

  // URL moderna: https://dev.azure.com/{org}
  const parts = trimmed.split('/');
  return parts[3] ?? '';
}

/** Indica de onde veio o ID da PR (pipeline ADO, CLI ou env local). */
export function resolvePullRequestIdSource(cli: CliArgs, pullRequestId: number): string {
  if (pullRequestId <= 0) {
    return '';
  }
  if (cli.pullRequestId != null && cli.pullRequestId > 0) {
    return '--pr-id';
  }
  if (process.env.SYSTEM_PULLREQUEST_PULLREQUESTID?.trim()) {
    return 'SYSTEM_PULLREQUEST_PULLREQUESTID';
  }
  if (process.env.CURSOR_REVIEWER_PR_ID?.trim()) {
    return 'CURSOR_REVIEWER_PR_ID';
  }
  if (process.env.GITHUB_REF?.includes('refs/pull/')) {
    return 'GITHUB_REF';
  }
  return 'desconhecida';
}

function resolveProvider(cli: CliArgs): 'azuredevops' | 'github' {
  if (cli.ado) return 'azuredevops';
  if (cli.gh) return 'github';

  if (
    process.env.GITHUB_ACTIONS === 'true' ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    process.env.GITHUB_REPOSITORY
  ) {
    return 'github';
  }

  if (
    process.env.TF_BUILD === 'true' ||
    process.env.SYSTEM_COLLECTIONURI ||
    process.env.CURSOR_REVIEWER_ADO_ORG
  ) {
    return 'azuredevops';
  }

  return 'azuredevops';
}

/** Normaliza ref git: `master` → `refs/heads/master`. */
export function normalizeBranchRef(ref: string): string {
  const trimmed = ref.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith('refs/heads/') || trimmed.startsWith('refs/remotes/')) {
    return trimmed;
  }
  return `refs/heads/${trimmed.replace(/^refs\/heads\//, '')}`;
}

function resolveSourceBranch(cli: CliArgs, repoRoot: string): string {
  const prSource = process.env.SYSTEM_PULLREQUEST_SOURCEBRANCH?.trim();
  if (prSource) {
    return normalizeBranchRef(prSource);
  }

  if (cli.sourceBranch) {
    return normalizeBranchRef(cli.sourceBranch);
  }

  const current = detectSourceBranchRef(repoRoot);
  if (current) {
    return normalizeBranchRef(current);
  }

  return '';
}

function resolveTargetBranch(cli: CliArgs): string {
  const configured =
    cli.targetBranch?.trim() ||
    process.env.SYSTEM_PULLREQUEST_TARGETBRANCH?.trim() ||
    resolveOptionalEnv(process.env.CURSOR_REVIEWER_TARGET_BRANCH, 'refs/heads/master');

  return normalizeBranchRef(configured);
}

export function loadConfig(argv: string[] = process.argv.slice(2)): ReviewerConfig {
  const cli = parseArgs(argv);

  if (cli.help) {
    printHelp();
    process.exit(0);
  }

  const moduleUrl = import.meta.url;
  const repoRootOverride = cli.repoRoot ?? process.env.CURSOR_REVIEWER_REPO_ROOT;
  const resolvedProject = resolveProject(moduleUrl, repoRootOverride);
  const repoRoot = resolvedProject.repoRoot;

  const cursorApiKey = process.env.CURSOR_API_KEY?.trim();
  if (!cursorApiKey) {
    throw new Error('CURSOR_API_KEY é obrigatório. Veja .env.example');
  }

  const sourceBranch = resolveSourceBranch(cli, repoRoot);
  const targetBranch = resolveTargetBranch(cli);

  if (!sourceBranch) {
    throw new Error(
      'Branch de origem não definida. Na pipeline use a branch da PR (SYSTEM_PULLREQUEST_SOURCEBRANCH); localmente esteja em uma branch git ou use --source-branch.',
    );
  }

  const provider = resolveProvider(cli);
  const isAdo = provider === 'azuredevops';

  const organization = isAdo
    ? (cli.organization ??
       process.env.CURSOR_REVIEWER_ADO_ORG ??
       extractOrgFromCollectionUri(process.env.SYSTEM_COLLECTIONURI ?? ''))
    : (cli.organization ??
       process.env.GITHUB_REPOSITORY_OWNER ??
       (process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[0] : '') ??
       '');

  const adoProject = isAdo
    ? (cli.project ?? process.env.SYSTEM_TEAMPROJECT ?? process.env.CURSOR_REVIEWER_ADO_PROJECT ?? '')
    : '';

  const repositoryName = isAdo
    ? (cli.repository ?? process.env.BUILD_REPOSITORY_NAME ?? process.env.CURSOR_REVIEWER_ADO_REPO ?? '')
    : (cli.repository ??
       (process.env.GITHUB_REPOSITORY ? process.env.GITHUB_REPOSITORY.split('/')[1] : '') ??
       '');

  let rawPullRequestId = cli.pullRequestId;
  if (rawPullRequestId == null) {
    if (isAdo) {
      rawPullRequestId = Number(process.env.SYSTEM_PULLREQUEST_PULLREQUESTID ?? process.env.CURSOR_REVIEWER_PR_ID ?? 0);
    } else {
      rawPullRequestId = Number(process.env.CURSOR_REVIEWER_PR_ID ?? 0);
      if (rawPullRequestId <= 0 && process.env.GITHUB_REF) {
        const match = process.env.GITHUB_REF.match(/refs\/pull\/(\d+)\//);
        if (match) {
          rawPullRequestId = Number(match[1]);
        }
      }
    }
  }

  const pullRequestId =
    Number.isInteger(rawPullRequestId) && rawPullRequestId > 0 ? rawPullRequestId : 0;
  const pullRequestIdSource = resolvePullRequestIdSource(cli, pullRequestId);

  const adoAccessToken = isAdo
    ? (process.env.SYSTEM_ACCESSTOKEN?.trim() ?? process.env.AZURE_DEVOPS_EXT_PAT?.trim() ?? '')
    : (process.env.GITHUB_TOKEN?.trim() ?? process.env.GH_TOKEN?.trim() ?? process.env.SYSTEM_ACCESSTOKEN?.trim() ?? '');

  const dryRun = cli.dryRun ?? parseBool(process.env.CURSOR_REVIEWER_DRY_RUN, false);
  const seedTest = cli.seedTest ?? parseBool(process.env.CURSOR_REVIEWER_SEED_TEST, false);
  const includeUncommitted =
    cli.includeUncommitted ??
    (parseBool(process.env.CURSOR_REVIEWER_INCLUDE_UNCOMMITTED, false) || seedTest);

  const hasContext = isAdo
    ? Boolean(organization && adoProject && repositoryName && pullRequestId > 0)
    : Boolean(organization && repositoryName && pullRequestId > 0);

  if (hasContext && !adoAccessToken) {
    throw new Error(
      isAdo
        ? 'Token ADO ausente. Na pipeline use SYSTEM_ACCESSTOKEN; localmente use AZURE_DEVOPS_EXT_PAT. Para dry-run sem consultar threads da PR, omita org/project/repo/pr-id.'
        : 'Token GitHub ausente. Use GITHUB_TOKEN ou GH_TOKEN para permitir o acesso à API do GitHub.'
    );
  }

  let stackName: string;
  let stackSource: 'cli' | 'env' | 'detected' | 'fallback';

  if (cli.stack) {
    stackName = cli.stack;
    stackSource = 'cli';
  } else if (seedTest) {
    stackName = 'ABP/Angular';
    stackSource = 'fallback';
  } else {
    const rawEnv = process.env.CURSOR_REVIEWER_STACK?.trim() ?? '';
    const isEnvSet = rawEnv && !isUnexpandedPipelineMacro(rawEnv);
    if (isEnvSet) {
      stackName = resolveOptionalEnv(process.env.CURSOR_REVIEWER_STACK, 'ABP/Angular');
      stackSource = 'env';
    } else {
      const detected = detectStack(repoRoot);
      if (detected) {
        stackName = detected;
        stackSource = 'detected';
      } else {
        stackName = 'ABP/Angular';
        stackSource = 'fallback';
      }
    }
  }

  let stackConfig = getStackConfig(stackName);
  let customPromptContent: string | undefined;
  const rawCustomPrompt = cli.customPrompt ?? process.env.CURSOR_REVIEWER_CUSTOM_PROMPT?.trim() ?? '';
  const customPromptVal = rawCustomPrompt && !isUnexpandedPipelineMacro(rawCustomPrompt) ? rawCustomPrompt : '';

  const rawIncludePatterns = cli.includePatterns ?? process.env.CURSOR_REVIEWER_INCLUDE_PATTERNS?.trim() ?? '';
  const includePatternsVal = rawIncludePatterns && !isUnexpandedPipelineMacro(rawIncludePatterns) ? rawIncludePatterns : '';

  let customStackError: Error | null = null;

  if (!stackConfig) {
    customStackError = new Error(`Stack "${stackName}" não é suportada.`);
  } else if (stackConfig.name === 'Custom' || customPromptVal) {
    try {
      if (stackConfig.name === 'Custom' && !customPromptVal) {
        throw new Error(
          'A stack "Custom" requer a definição do parâmetro --custom-prompt ou da variável de ambiente CURSOR_REVIEWER_CUSTOM_PROMPT.',
        );
      }

      if (customPromptVal) {
        if (stackConfig.name !== 'Custom') {
          throw new Error(
            '--custom-prompt / CURSOR_REVIEWER_CUSTOM_PROMPT só é permitido com --stack=Custom.',
          );
        }
        customPromptContent = resolveCustomPromptContent(customPromptVal, repoRoot);
        if (!customPromptContent?.trim()) {
          throw new Error(
            'A stack "Custom" requer prompt customizado com conteúdo não vazio.',
          );
        }
      }
    } catch (err: any) {
      customStackError = err;
    }
  }

  let includePatternsResetByFallback = false;

  if (customStackError) {
    // Falha na stack customizada ou stack desconhecida. Ativamos fallback automático.
    const originalStack = stackName;
    const detected = detectStack(repoRoot);
    const fallbackStackName = detected ?? 'ABP/Angular';
    stackConfig = getStackConfig(fallbackStackName)!;
    stackName = stackConfig.name;
    stackSource = detected ? 'detected' : 'fallback';
    customPromptContent = undefined; // descarta o prompt customizado com problema
    includePatternsResetByFallback = Boolean(includePatternsVal);

    console.warn('\x1b[33m%s\x1b[0m', `\n⚠️  [Cursor Reviewer] AVISO DE CONFIGURAÇÃO DE STACK/PROMPT:`);
    console.warn('\x1b[33m%s\x1b[0m', `   ${customStackError.message}`);
    console.warn('\x1b[33m%s\x1b[0m', `   Fallback ativado: utilizando stack "${stackName}" (${detected ? 'auto-detectada' : 'fallback padrão'}).\n`);
  }

  // Garantimos que stackConfig não é undefined (se for, usamos ABP/Angular como último recurso)
  if (!stackConfig) {
    stackConfig = getStackConfig('ABP/Angular')!;
    stackName = stackConfig.name;
    stackSource = 'fallback';
  }

  let includePatterns: string[];

  if (includePatternsVal && !includePatternsResetByFallback) {
    const parsed = parseCsvPatterns(includePatternsVal);
    if (parsed.length === 0) {
      console.warn('\x1b[33m%s\x1b[0m', `\n⚠️  [Cursor Reviewer] AVISO: --include-patterns parseou para lista vazia. Usando os padrões padrão da stack: "${stackConfig.name}".\n`);
      includePatterns = stackConfig.name === 'Custom' ? ['**/*'] : stackConfig.includePatterns;
    } else {
      includePatterns = parsed;
    }
  } else {
    includePatterns = stackConfig.name === 'Custom' ? ['**/*'] : stackConfig.includePatterns;
  }

  const stackPromptPath = stackConfig.promptFileName
    ? resolve(
        resolvedProject.runnerRoot,
        'skills',
        'stacks',
        stackConfig.promptFileName,
      )
    : null;

  const engine = parseEngine(process.env.CURSOR_REVIEWER_ENGINE);

  return {
    repoRoot,
    cursorApiKey,
    engine,
    model: resolveReviewerModel(engine, cli.model),
    botTag: cli.botTag ?? process.env.CURSOR_REVIEWER_BOT_TAG ?? '[Cursor Reviewer]',
    verbose: cli.verbose ?? parseBool(process.env.CURSOR_REVIEWER_VERBOSE, true),
    dryRun,
    includeUncommitted,
    seedTest,
    sourceBranch,
    targetBranch,
    provider,
    organization,
    project: adoProject,
    repositoryName,
    pullRequestId,
    pullRequestIdSource,
    adoAccessToken,
    includePatterns,
    excludePatterns: resolveExcludePatterns(repoRoot, resolvedProject.runnerRoot),
    skillPath: resolvedProject.codeReviewSkillPath,
    systemPromptPath: resolvedProject.systemPromptPath,
    projectName: resolvedProject.projectName,
    version: resolvedProject.version,
    maxRounds: parseNonNegativeInt(process.env.CURSOR_REVIEWER_MAX_ROUNDS, DEFAULT_MAX_ROUNDS),
    scoreMin: parseScoreMin(
      cli.scoreMin != null && Number.isFinite(cli.scoreMin)
        ? cli.scoreMin
        : process.env.SCORE_MIN,
    ),
    stack: stackConfig.name,
    stackPromptPath,
    stackSource,
    customPromptContent,
  };
}

export { ProjectValidationError };

function printHelp(): void {
  console.log(`
Cursor Reviewer — code review agêntico portável via @cursor/sdk

Uso:
  npm run review -- [opções]

Opções:
  --dry-run              Executa sem publicar threads; exit 0 salvo erro de execução
  --include-uncommitted  Inclui staged/unstaged/untracked vs HEAD além do diff de branch
  --seed-test            Modo validação seed (ativa include-uncommitted + prompt de teste)
  --verbose / --quiet    Controle de logs
  --source-branch REF    Override local da branch da PR (pipeline usa SYSTEM_PULLREQUEST_SOURCEBRANCH)
  --target-branch REF    Branch de comparação do diff (default: refs/heads/master)
  --org, --project, --repo, --pr-id   Contexto Azure DevOps/GitHub
  --bot-tag TAG          Tag do bot
  --model ID             Modelo Cursor (default canônico: composer-2.5)
  --repo-root PATH       Raiz do repositório (default: detectado via scripts/cursor-reviewer)
  --ado / --gh           Define a estratégia de execução/plataforma (Azure DevOps ou GitHub)
  --stack NAME           Stack tecnológica para o review (ABP/Angular, PHP/Laravel, Next.js/React, TypeScript, Custom. Default: ABP/Angular)
  --custom-prompt VAL    Caminho do arquivo ou string de prompt quando a stack é Custom (requerido para --stack=Custom)
  --include-patterns VAL Lista separada por vírgulas de padrões glob de inclusão (sobrescreve o default da stack)
  --score-min N          Score mínimo (inclusive) para publicar issue como thread (default: 6)

Pré-requisitos do projeto alvo (obrigatórios — o script encerra se ausentes):
  skills/CODE_REVIEW.md
  skills/SYSTEM_PROMPT.md

Variáveis: CURSOR_API_KEY, CURSOR_REVIEWER_ENGINE (default: cursor-sdk),
  CURSOR_REVIEWER_TARGET_BRANCH (default: refs/heads/master),
  SCORE_MIN (default: 6), CURSOR_REVIEWER_INCLUDE_UNCOMMITTED, CURSOR_REVIEWER_SEED_TEST,
  CURSOR_REVIEWER_REVIEW_SELF, CURSOR_REVIEWER_EXTRA_EXCLUDE_PATTERNS, ...

Branches:
  - Source: sempre a branch da PR (SYSTEM_PULLREQUEST_SOURCEBRANCH na pipeline; branch git atual localmente)
  - Target: CURSOR_REVIEWER_TARGET_BRANCH ou --target-branch (default: refs/heads/master)

Exemplo local:
  npm run review -- --dry-run

Exemplo local com target customizado:
  CURSOR_REVIEWER_TARGET_BRANCH=refs/heads/develop npm run review -- --dry-run
`);
}

function assertPathInsideRepo(resolvedPath: string, repoRoot: string): void {
  const rel = relative(resolve(repoRoot), resolve(resolvedPath));
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      `Arquivo de prompt customizado deve estar dentro do repositório: "${resolvedPath}"`,
    );
  }
}

function resolveCustomPromptContent(customPromptVal: string, repoRoot: string): string {
  const trimmed = customPromptVal.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.includes('\n') || trimmed.includes('\r')) {
    return trimmed;
  }

  const p = resolve(repoRoot, trimmed);
  if (existsSync(p)) {
    const canonicalPath = realpathSync(p);
    const canonicalRepoRoot = realpathSync(repoRoot);
    assertPathInsideRepo(canonicalPath, canonicalRepoRoot);
    try {
      return readFileSync(canonicalPath, 'utf8');
    } catch (err: any) {
      throw new Error(`Erro ao ler o arquivo de prompt customizado em "${p}": ${err.message}`);
    }
  }

  const looksLikeFilePath =
    trimmed.startsWith('./') ||
    trimmed.startsWith('.\\') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('..\\') ||
    /^[A-Za-z]:\\/.test(trimmed) ||
    /^[A-Za-z]:\//.test(trimmed) ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\') ||
    ((trimmed.endsWith('.md') || trimmed.endsWith('.txt')) &&
      (trimmed.includes('/') || trimmed.includes('\\')));

  if (looksLikeFilePath) {
    throw new Error(`Arquivo de prompt customizado não encontrado: "${trimmed}"`);
  }

  return trimmed;
}
