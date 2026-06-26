import { readFileSync, existsSync } from 'node:fs';
import type { ReviewerConfig } from '../config.js';
import type { DiffPromptSection } from '../git/diff-prompt.js';
import type { LocalReviewGitContext } from '../git/diff.js';

export interface PromptContext {
  workItemContext: string;
  prDescriptionContext: string;
  existingReviewContext: string;
  rulesContext: string;
  diffSection: DiffPromptSection;
  diffStats: { fileCount: number; files: string[] };
  gitContext: LocalReviewGitContext;
}

const CODE_REVIEW_SKILL = 'skills/CODE_REVIEW.md';

function loadFileContent(path: string, label: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`Falha ao carregar ${label}: ${path} — ${String(error)}`);
  }
}

function buildSkillSection(skillContent: string): string[] {
  return [
    '---',
    '',
    '# Harness do projeto',
    '',
    skillContent,
  ];
}

function buildDiffSection(diffSection: DiffPromptSection): string[] {
  if (diffSection.mode === 'empty' && !diffSection.content) {
    return [];
  }

  const modeLabel =
    diffSection.mode === 'full'
      ? 'unified diff completo'
      : diffSection.mode === 'per-file'
        ? `por arquivo (${diffSection.includedFiles} incluídos)`
        : 'resumo';

  return [
    '---',
    '',
    '## Diff da PR (pré-carregado)',
    '',
    `> Modo: **${modeLabel}**. Use esta seção na **Fase 1**; complemente com \`read\`/\`grep\` na Fase 2.`,
    '',
    diffSection.content,
    '',
  ];
}

function buildExecutionContext(config: ReviewerConfig, context: PromptContext): string[] {
  const sourceRef = context.gitContext.sourceBranch;
  const targetRef = context.gitContext.targetBranch;
  const diffRange = context.gitContext.diffRange;
  const diffScopeLabel = context.gitContext.includeUncommitted
    ? `${diffRange} + working tree (uncommitted vs HEAD)`
    : diffRange;

  const largePrNote =
    context.diffStats.fileCount > 20
      ? `\n> **PR grande (${context.diffStats.fileCount} arquivos):** execute as duas fases em **todos** os arquivos elegíveis — sem atalhos.\n`
      : '';

  const lines = [
    '---',
    '',
    `# Pipeline — ${config.projectName}`,
  ];

  if (largePrNote) {
    lines.push(largePrNote);
  }

  lines.push(
    '',
    '## Contexto da execução',
    '',
    `\`cwd\` = \`${config.repoRoot}\`. Diff e rules já estão embutidos abaixo; use tools para expandir contexto na Fase 2.`,
    '',
  );

  if (config.pullRequestId > 0) {
    lines.push(
      `- **Pull Request ID (Azure DevOps):** #${config.pullRequestId}`,
      `- **Fonte do ID da PR:** \`${config.pullRequestIdSource || 'desconhecida'}\``,
      `- **Atenção:** não confunda o ID da PR com IDs de Work Items (User Story/Task) linkados à PR.`,
      '',
    );
  }

  lines.push(
    `- **Branch:** \`${sourceRef}\` → \`${targetRef}\``,
    `- **Diff range:** \`${diffScopeLabel}\``,
    `- **Stack:** \`${config.stack}\``,
    `- **Arquivos elegíveis:** ${context.diffStats.fileCount}`,
    context.diffStats.files.length > 0
      ? `- **Lista:** ${context.diffStats.files.slice(0, 30).join(', ')}${context.diffStats.files.length > 30 ? '...' : ''}`
      : '',
    `- **Include:** ${config.includePatterns.join(', ')}`,
    `- **Exclude:** ${config.excludePatterns.join(', ')}`,
    '',
  );

  if (context.rulesContext) {
    lines.push(context.rulesContext, '');
  }

  return lines;
}

function buildSeedTestSection(): string[] {
  return [
    '## Modo seed test (obrigatório nesta execução)',
    '',
    '1. Leia `scripts/cursor-reviewer/SEED-ISSUES.md` e `fixtures/seed/expected-scenarios.json`.',
    '2. Reporte cada defeito intencional nos arquivos `CursorReviewerSeed*` / `cursor-reviewer-seed*`.',
    '3. Não descarte achados só por `Compile Remove` ou rota Angular ausente.',
    '4. Cada review: `suggestedFix`, score ≥ 5, keywords do cenário.',
    '',
  ];
}

function buildTwoPhaseWorkflow(context: PromptContext, scoreMin: number): string[] {
  const diffRange = context.gitContext.diffRange;
  const hasEmbeddedDiff = context.diffSection.mode !== 'empty';
  const diffStep = hasEmbeddedDiff
    ? 'Use o **diff pré-carregado** acima como base da triagem.'
    : context.gitContext.includeUncommitted
      ? `Execute \`git diff ${diffRange}\` **e** \`git diff HEAD\` / untracked nos paths elegíveis.`
      : `Execute \`git diff ${diffRange}\` nos arquivos elegíveis.`;

  const omittedNote =
    context.diffSection.omittedFiles > 0
      ? `\n   - **${context.diffSection.omittedFiles} arquivo(s)** ficaram fora do diff embutido — leia via tools antes de concluir.`
      : '';

  return [
    '## Análise em duas fases (obrigatória — não pule etapas)',
    '',
    'Complete **Fase 1 inteira** antes de iniciar a Fase 2. Não publique achado sem passar pelas duas.',
    '',
    '### Fase 1 — Triagem (mapa de candidatos)',
    '',
    'Objetivo: lista enxuta de **hipóteses** ancoradas em linhas alteradas — ainda **sem** veredito final.',
    '',
    `1. ${diffStep}`,
    '2. Incorpore descrição da PR, work items e threads ADO (contexto abaixo, se houver).',
    `3. Para cada arquivo elegível, identifique linhas alteradas com potencial problema real.${omittedNote}`,
    '4. **Descarte imediatamente:** nits, estilo, preferências, alertas teóricos sem caminho executável, código pré-existente intocado.',
    '5. Em `*.html`: ignore CSS/Tailwind/layout; candidate só segurança, permissões, bindings e validações.',
    '6. Mantenha candidato somente com hipótese concreta de falha, regressão ou violação de regra.',
    '',
    '**Saída mental da Fase 1:** lista de candidatos `(arquivo, linha, hipótese breve)` — pode estar vazia.',
    '',
    '### Fase 2 — Investigação profunda + classificação (obrigatória por candidato)',
    '',
    'Objetivo: **provar ou refutar** cada candidato com tools; só os comprovados entram em `reviews`.',
    '',
    '#### 2.1 — Carregar critérios do projeto',
    '',
    'Leia as **rules pré-mapeadas** (seção acima) e a skill: `.agents/skills/code-review/SKILL.md`.',
    '',
    '#### 2.2 — Expandir contexto com tools (por candidato)',
    '',
    '| Camada | O que ler (`read`, `grep`, `glob`, busca semântica) |',
    '|--------|-----------------------------------------------------|',
    '| Arquivo alterado | Arquivo inteiro ou símbolos + trechos adjacentes |',
    '| Backend | Entidade/DTO, AppService, `[Authorize]`, EF, constantes `Domain.Shared` |',
    '| Frontend | Componente, template, guards, `*abpPermission`, formulários |',
    '| Testes | `test/**/*`, specs — cobertura existente ou ausência material |',
    '| Consumidores | Chamadores, fluxo ponta a ponta (API → service → UI) |',
    '| Projeto | Rules listadas acima, `docs/` quando regra de negócio |',
    '',
    '#### 2.3 — Prova obrigatória (documentar em `analysis`)',
    '',
    'Para incluir em `reviews`, complete os 4 itens com evidência de tools:',
    '',
    '1. **Evidência lida** — arquivos/símbolos inspecionados (liste em `impactPaths`).',
    '2. **Cenário de falha executável** — entrada/estado que dispara o problema.',
    '3. **Proteção ausente** — por que testes/validações/invariantes **não** cobrem (cite o que verificou).',
    '4. **Descartes** — hipóteses alternativas consideradas e rejeitadas.',
    '',
    'Não completou os 4 → **não inclua** em `reviews`.',
    '',
    '#### 2.4 — Classificar e filtrar',
    '',
    '1. Atribua `severity` e `score` conforme tabelas do **System Prompt**.',
    `2. Aplique o filtro de publicação: score < ${scoreMin} → omita; só \`fix-code\` ou \`escalate\`.`,
    '3. Combine múltiplos achados na **mesma linha** em um único review.',
    '4. Preencha `comment` (amigável, sem código); `suggestedFix` só se houver patch cirúrgico claro (senão `""`).',
    '',
    '### Fase 3 — Prevenção de Whack-a-Mole (Agrupamento e Generalização)',
    '',
    'Para **cada achado comprovado na Fase 2**, antes de emitir o JSON final: você DEVE usar `grep`/`glob` para procurar **ocorrências irmãs do mesmo padrão** em todos os arquivos elegíveis do diff.',
    '',
    '- Exemplos: `[Authorize]` ausente num endpoint → verifique os demais endpoints; `.Result`/`.Wait()` num método → verifique os demais.',
    '- Agrupe **todas** as ocorrências da mesma classe no array `relatedOccurrences` do review principal. **Não** reporte só a primeira e deixe as irmãs para a próxima rodada — isso quebra a convergência.',
  ];
}

function buildVerdictAndAdoPolicy(): string[] {
  return [
    '',
    '### Veredito final',
    '',
    '1. Releia cada review contra o filtro de publicação do System Prompt.',
    '2. **Completude:** confirme que percorreu **todos** os arquivos elegíveis e que cada achado real e comprovado foi incluído — não reserve achados para rodadas futuras (convergência em uma rodada).',
    '3. **Não duplique** threads ADO existentes (contexto abaixo), incluindo a tabela de threads **já resolvidas** — não re-levante um problema resolvido sem **nova evidência** de que voltou.',
    '4. `resolvedThreads`: somente se **verificou** via tools que o problema foi corrigido.',
    '5. PR sem issues novas: `"reviews": []` + `reviewSummary` positivo.',
    '6. Emita **somente** o bloco JSON — sem narrativa fora do JSON.',
  ];
}

export function buildAgentPrompt(config: ReviewerConfig, context: PromptContext): string {
  const systemPromptContent = loadFileContent(config.systemPromptPath, 'System Prompt');
  const codeReviewSkillContent = loadFileContent(config.skillPath, 'Skill CODE_REVIEW.md');

  let stackPromptContent = '';
  if (config.customPromptContent) {
    stackPromptContent = config.customPromptContent;
  } else if (config.stackPromptPath && existsSync(config.stackPromptPath)) {
    stackPromptContent = loadFileContent(config.stackPromptPath, `Stack Prompt (${config.stack})`);
  }

  const sections: string[] = [
    systemPromptContent,
    '',
    ...buildSkillSection(codeReviewSkillContent),
    '',
  ];

  if (stackPromptContent) {
    sections.push(
      '---',
      '',
      `# Recomendações Específicas da Stack (${config.stack})`,
      '',
      stackPromptContent,
      '',
    );
  }

  sections.push(
    ...buildExecutionContext(config, context),
    ...buildDiffSection(context.diffSection),
  );

  if (context.prDescriptionContext) {
    sections.push('', context.prDescriptionContext);
  }

  if (config.seedTest) {
    sections.push(...buildSeedTestSection());
  }

  sections.push(...buildTwoPhaseWorkflow(context, config.scoreMin), ...buildVerdictAndAdoPolicy());

  if (context.workItemContext) {
    sections.push('', context.workItemContext);
  }

  if (context.existingReviewContext) {
    sections.push('', context.existingReviewContext);
  }

  return sections.join('\n');
}
