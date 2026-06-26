import { evaluateGate, formatGateSummary } from './ado/gate.js';
import {
  getCodeReviewPostingPlan,
  getNewReviewsFromPlan,
  parseCodeReviewResponse,
  simulateThreadResolution,
} from './ado/post-comments.js';
import { filterGatePendingThreads } from './ado/review-context.js';
import {
  decideRoundEscalation,
  splitReviewsForEscalation,
} from './ado/round-state.js';
import type { CodeReviewItem, PendingPrThread, ReviewContextResult } from './ado/types.js';
import { runCodeReviewAgent } from './agent/runner.js';
import { EMPTY_METRICS } from './engine/types.js';
import { getEngine } from './engine/index.js';
import { loadConfig, ProjectValidationError } from './config.js';
import { buildDiffPromptSection } from './git/diff-prompt.js';
import {
  formatDiffSizeKb,
  getDiffBreakdown,
  getDiffFileSummaries,
  prepareLocalReviewWorkspace,
  type DiffFileSummary,
} from './git/diff.js';
import { createLogger, type Logger } from './logger.js';
import { parseAgentReviewOutput } from './parser/review-response.js';
import { buildRulesMap } from './project/rules-map.js';
import { formatCommentForPosting } from './ado/format-thread.js';
import { getProvider } from './provider/index.js';

function logDiffFileSummaries(
  logger: Logger,
  title: string,
  summaries: DiffFileSummary[],
): void {
  logger.info(`${title}: ${summaries.length}`);
  if (summaries.length === 0) {
    logger.info('  (nenhum)');
    return;
  }
  for (let i = 0; i < summaries.length; i++) {
    const { file, sizeBytes } = summaries[i];
    logger.info(`  ${i + 1}. ${file} (${formatDiffSizeKb(sizeBytes)})`);
  }
}

function formatElapsedMs(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m${secs}s`;
}

async function main(): Promise<void> {
  const startTime = performance.now();
  const config = loadConfig();
  const logger = createLogger(config.verbose);

  logger.section(`${config.projectName} Cursor Reviewer v${config.version}`);
  logger.info(`Modo: ${config.dryRun ? 'DRY-RUN' : 'PIPELINE'}`);
  logger.info(`Model: ${config.model}`);
  logger.info(`Engine: ${config.engine}`);
  const stackSourceLabel =
    config.stackSource === 'cli'
      ? 'configurada via CLI'
      : config.stackSource === 'env'
        ? 'configurada via env'
        : config.stackSource === 'detected'
          ? 'autodetectada'
          : 'fallback padrão';
  logger.info(`Stack: ${config.stack} (${stackSourceLabel})`);
  logger.info(`Score mínimo para threads: ${config.scoreMin}`);
  logger.info(`Source: ${config.sourceBranch} → Target: ${config.targetBranch}`);
  logger.info(`Repository Root: ${config.repoRoot}`);
  logger.info(`Code-review skill: ${config.skillPath}`);
  logger.info(`System-prompt path: ${config.systemPromptPath}`);
  logger.info(`Include Patterns: ${JSON.stringify(config.includePatterns)}`);
  logger.info(`Exclude Patterns: ${JSON.stringify(config.excludePatterns)}`);
  if (config.includeUncommitted) {
    logger.info('Diff uncommitted: SIM (working tree vs HEAD incluído no escopo)');
  }
  if (config.seedTest) {
    logger.info('Modo: SEED TEST (validação local de detecção)');
  }

  if (config.pullRequestId) {
    logger.info(
      `Pull Request ID: #${config.pullRequestId}` +
        (config.pullRequestIdSource ? ` (fonte: ${config.pullRequestIdSource})` : ''),
    );
    logger.info(
      `ADO Context: org=${config.organization}, project=${config.project}, repo=${config.repositoryName}`,
    );
  }

  logger.section('Preparando repositório local');
  const gitContext = prepareLocalReviewWorkspace(
    config.repoRoot,
    config.sourceBranch,
    config.targetBranch,
    (msg) => logger.info(msg),
  );
  gitContext.includeUncommitted = config.includeUncommitted;

  const diffOptions = { includeUncommitted: config.includeUncommitted };

  const diffStats = getDiffBreakdown(
    config.repoRoot,
    gitContext.diffRange,
    config.includePatterns,
    config.excludePatterns,
    diffOptions,
  );

  logger.section('Git diff — comparação de branches');
  logger.info(
    `Range: ${gitContext.diffRange}${config.includeUncommitted ? ' + working tree (uncommitted)' : ''} (${config.sourceBranch} → ${config.targetBranch})`,
  );

  const filteredDiffOptions = { ...diffOptions, files: diffStats.filteredFiles };
  const diffFileSummaries = getDiffFileSummaries(
    config.repoRoot,
    gitContext.diffRange,
    filteredDiffOptions,
  );

  logger.info(`Arquivos alterados (pré-filtro): ${diffStats.allChangedFiles.length}`);
  logDiffFileSummaries(logger, 'Arquivos elegíveis (pós-filtro)', diffFileSummaries);
  logger.info(`${diffStats.fileCount} arquivo(s) elegível(is) no diff.`);

  const diffSection = buildDiffPromptSection(
    config.repoRoot,
    gitContext.diffRange,
    diffStats.filteredFiles,
    diffOptions,
  );
  if (diffSection.mode !== 'empty') {
    logger.info(
      `Diff no prompt: modo=${diffSection.mode}, ${formatDiffSizeKb(diffSection.totalBytes)}, ` +
        `${diffSection.includedFiles} arquivo(s) incluído(s)` +
        (diffSection.omittedFiles > 0 ? `, ${diffSection.omittedFiles} omitido(s)` : ''),
    );
  }

  const rulesMap = buildRulesMap(config.repoRoot, diffStats.filteredFiles);
  if (rulesMap.uniqueRules.length > 0) {
    logger.info(`Rules pré-mapeadas: ${rulesMap.uniqueRules.length}`);
  }

  const provider = getProvider(config);
  await provider.initialize(config, logger);

  const isAdo = config.provider === 'azuredevops';
  const hasContext = isAdo
    ? Boolean(config.organization && config.project && config.repositoryName && config.pullRequestId > 0)
    : Boolean(config.organization && config.repositoryName && config.pullRequestId > 0);

  if (diffStats.fileCount === 0 && !hasContext) {
    logger.warn('Nenhum arquivo elegível e sem contexto configurado. Encerrando.');
    return;
  }

  if (diffStats.fileCount === 0) {
    logger.warn('Nenhum arquivo elegível no diff — pulando agente; avaliando gate.');
  }

  if (diffStats.fileCount > 20) {
    logger.warn(`PR grande: ${diffStats.fileCount} arquivos elegíveis — revisão completa em todas as fases.`);
  }

  let reviewContext: ReviewContextResult = {
    existingKeys: new Map<string, boolean>(),
    contextForLlm: '',
    activeThreads: [],
    allThreads: null,
    pendingThreads: [],
  };
  let workItemContext = '';
  let prDescriptionContext = '';

  if (hasContext) {
    logger.section(`Coletando contexto ${isAdo ? 'Azure DevOps' : 'GitHub'}`);

    const [workItems, prContext, prDetails] = await Promise.all([
      provider.getPullRequestWorkItemContext(10, (msg) => logger.info(msg)),
      provider.getPullRequestReviewContext(config.botTag, (msg) => logger.info(msg)),
      provider.getPullRequestContext((msg) => logger.info(msg)),
    ]);

    workItemContext = workItems.contextForLlm;
    reviewContext = prContext;
    prDescriptionContext = prDetails.contextForLlm;
  }

  const engine = getEngine(config);

  const agentStartTime = performance.now();
  if (diffStats.fileCount > 0 && config.pullRequestId > 0 && !hasContext) {
    logger.info(`Iniciando revisão somente leitura da PR #${config.pullRequestId}.`);
  }
  const agentResult =
    diffStats.fileCount > 0
      ? await runCodeReviewAgent(
          config,
          {
            workItemContext,
            prDescriptionContext,
            existingReviewContext: reviewContext.contextForLlm,
            rulesContext: rulesMap.contextForPrompt,
            diffSection,
            diffStats,
            gitContext,
          },
          engine,
          logger,
        )
      : {
          fullText: '{"reviews":[],"resolvedThreads":[],"reviewSummary":""}',
          sessionId: 'skipped',
          runId: 'no-diff',
          status: 'skipped',
          metrics: EMPTY_METRICS,
        };
  const agentElapsed = performance.now() - agentStartTime;

  if (diffStats.fileCount === 0) {
    logger.section('Processando resposta do agente');
    logger.info('Agente omitido — diff vazio com contexto ADO.');
  } else {
    logger.section('Processando resposta do agente');
    logger.info(`Tempo do agente: ${formatElapsedMs(agentElapsed)}`);
  }
  const rawResponse = parseAgentReviewOutput(agentResult.fullText);
  const parsed = parseCodeReviewResponse(rawResponse, config.scoreMin);

  logger.info(`Reviews: ${parsed.reviews.length}`);
  logger.info(`Resolved threads (agent): ${parsed.resolvedThreads.length}`);
  logger.info(`Has critical: ${parsed.hasCriticalReviews}`);

  for (const review of parsed.reviews) {
    if (review.score != null) {
      logger.debug(
        `  [${review.severity}] score=${review.score} action=${review.developerAction} ${review.fileName}:${review.lineNumber}`,
      );
    }
  }

  if (parsed.reviewSummary) {
    logger.info(`Review summary: ${parsed.reviewSummary.slice(0, 120)}...`);
  }

  let resolvedCount = 0;
  let postedReviews: CodeReviewItem[] = [];
  let pendingThreads = [...reviewContext.pendingThreads];

  const gatePendingBeforePost = filterGatePendingThreads(reviewContext.pendingThreads, config.botTag);
  const wouldPostReviewsPre = getNewReviewsFromPlan(
    getCodeReviewPostingPlan(parsed, gatePendingBeforePost.length > 0).reviewsJson,
    reviewContext.existingKeys,
    config.scoreMin,
  );

  // Frente C — orçamento de rodadas + escalonamento (garantia de convergência).
  const priorRoundState = provider.parseRoundStateFromThreads(reviewContext.allThreads, config.botTag);
  const currentRound = hasContext ? priorRoundState.round + 1 : 0;
  const hasOpenIssues = wouldPostReviewsPre.length > 0 || gatePendingBeforePost.length > 0;
  const escalate = decideRoundEscalation({ currentRound, maxRounds: config.maxRounds, hasOpenIssues });

  let effectiveParsed = parsed;
  let suppressedCount = 0;
  if (escalate) {
    const split = splitReviewsForEscalation(parsed.reviews);
    suppressedCount = split.suppressed.length;
    effectiveParsed = {
      ...parsed,
      reviews: split.kept,
      reviewsJson: JSON.stringify({ reviews: split.kept }),
      hasCriticalReviews: split.kept.some((review) => review.severity === 'critical'),
      reviewSummary: '',
    };
    logger.warn(
      `Escalonamento: rodada ${currentRound} > limite ${config.maxRounds}. ` +
        `Suprimindo ${suppressedCount} apontamento(s) não-crítico(s); mantendo apenas critical. Revisão humana recomendada.`,
    );
  }

  const wouldPostReviews = escalate
    ? getNewReviewsFromPlan(
        getCodeReviewPostingPlan(effectiveParsed, gatePendingBeforePost.length > 0).reviewsJson,
        reviewContext.existingKeys,
        config.scoreMin,
      )
    : wouldPostReviewsPre;

  const isDryRunOrNoContext = config.dryRun || !hasContext;

  if (isDryRunOrNoContext) {
    logger.section(config.dryRun ? 'DRY-RUN — JSON que seria publicado' : 'LOG-ONLY — JSON que seria publicado');
    console.log(JSON.stringify(rawResponse, null, 2));
    postedReviews = wouldPostReviews;

    // F3: Dry-run preview formatado
    if (wouldPostReviews.length > 0) {
      logger.section(config.dryRun ? 'DRY-RUN — Preview das threads' : 'LOG-ONLY — Preview das threads');
      for (const review of wouldPostReviews) {
        const formatted = formatCommentForPosting(review, config.botTag, config.provider === 'github');
        logger.info(`\n┌─ ${review.fileName}:${review.lineNumber} [${review.severity}] score=${review.score ?? '?'}`);
        logger.info(`│ ${formatted.split('\n').join('\n│ ')}`);
        logger.info('└─');
      }
    }

    if (hasContext) {
      const simulated = simulateThreadResolution(
        reviewContext.activeThreads,
        pendingThreads,
        parsed.resolvedThreads,
      );
      resolvedCount = simulated.resolvedCount;
      pendingThreads = simulated.pendingThreads;
      if (resolvedCount > 0) {
        logger.info(
          `[dry-run] Simulando resolução/recuperação: ${resolvedCount} thread(s) removida(s) do gate pendente.`,
        );
      }
      if (currentRound > 0 && hasOpenIssues) {
        logger.info(
          `[dry-run] Rodada ${currentRound}${config.maxRounds > 0 ? `/${config.maxRounds}` : ''}` +
            (escalate ? ` — ESCALONAMENTO (suprimiria ${suppressedCount} não-crítico(s); revisão humana).` : '.'),
        );
      }
    }
  } else if (hasContext) {
    logger.section('Resolvendo threads confirmadas pelo agente');
    resolvedCount = await provider.resolvePullRequestReviewThreads(
      config.botTag,
      reviewContext.activeThreads,
      parsed.resolvedThreads,
      (msg) => logger.info(msg),
    );
    logger.info(`Resolved ${resolvedCount} active thread(s).`);

    if (resolvedCount > 0) {
      const afterResolve = await provider.getPullRequestReviewContext(
        config.botTag,
        (msg) => logger.debug(msg),
      );
      reviewContext.pendingThreads = afterResolve.pendingThreads;
    }

    const gatePendingBeforePost = filterGatePendingThreads(reviewContext.pendingThreads, config.botTag);
    const postingPlan = getCodeReviewPostingPlan(effectiveParsed, gatePendingBeforePost.length > 0);

    logger.section('Publicando comentários na PR');
    const postedThreads = await provider.setPullRequestComments(
      config.botTag,
      postingPlan.reviewsJson,
      reviewContext.existingKeys,
      (msg) => logger.info(msg),
    );
    postedReviews = postedThreads.map((item) => item.review);

    const gateBeforeSummary = evaluateGate({
      newReviews: postedReviews,
      resolvedCount,
      pendingThreads: gatePendingBeforePost,
    });

    if (postingPlan.postSummary && !gateBeforeSummary.shouldFail) {
      logger.section('Publicando resumo final');
      await provider.setPullRequestReviewSummary(
        config.botTag,
        postingPlan.reviewSummary,
        reviewContext.allThreads,
        (msg) => logger.info(msg),
      );
    } else if (postingPlan.reviewSummary.trim()) {
      logger.info('Skipping final review summary (issues pendentes ou reviews novos).');
    } else {
      logger.info('Skipping final review summary (empty summary or critical issues remain).');
    }

    const refreshedContext = await provider.getPullRequestReviewContext(
      config.botTag,
      (msg) => logger.debug(msg),
    );
    pendingThreads = refreshedContext.pendingThreads;

    // Persiste o contador de rodadas (e o aviso de escalonamento) quando houve
    // alguma issue nesta rodada — garante a convergência do loop fix→review.
    if (currentRound > 0 && (hasOpenIssues || escalate)) {
      logger.section('Atualizando estado de rodada');
      await provider.persistRoundState(
        config.botTag,
        { currentRound, maxRounds: config.maxRounds, escalate, suppressedCount },
        priorRoundState,
        (msg) => logger.info(msg),
      );
    }
  }

  const gatePending = filterGatePendingThreads(pendingThreads, config.botTag);
  const gate = evaluateGate({
    newReviews: postedReviews,
    resolvedCount,
    pendingThreads: gatePending,
  });

  const totalElapsed = performance.now() - startTime;
  logger.section('Concluído');
  logger.info(`Agent: ${agentResult.sessionId} | Run: ${agentResult.runId}`);
  logger.info(`Tempo total: ${formatElapsedMs(totalElapsed)}`);
  console.log(
    formatGateSummary(gate, agentResult.sessionId, agentResult.runId, isDryRunOrNoContext, agentResult.metrics),
  );

  // Visibilidade na build.
  provider.emitPipelineReviewOutput(gate, postedReviews, isDryRunOrNoContext, agentResult.metrics);
}

main()
  .then(() => {
    process.exit(process.exitCode ?? 0);
  })
  .catch((error) => {
    console.error('\n❌ [cursor-reviewer] ERRO FATAL');
    if (error instanceof ProjectValidationError || error instanceof Error) {
      console.error(error.message);
      if (error.cause) {
        console.error(`\nCausa:\n`, error.cause);
      }
      try {
        const extraProps = JSON.stringify(error, Object.getOwnPropertyNames(error).filter(k => k !== 'message' && k !== 'stack'), 2);
        if (extraProps !== '{}') {
          console.error(`\nPropriedades do Erro:\n${extraProps}`);
        }
      } catch {
        // Ignora falha de serialização
      }
      if (error.stack) {
        console.error(`\nStack Trace:\n${error.stack}`);
      }
    } else {
      console.error('Erro desconhecido:', error);
      try {
        console.error(JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      } catch {
        // ignora erro de json
      }
    }
    const exitCode = typeof process.exitCode === 'number' && process.exitCode !== 0 ? process.exitCode : 1;
    process.exit(exitCode);
  });
