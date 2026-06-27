---
name: code-review-self
description: Code review agêntica read-only pelo harness/IDE, espelhando src/index.ts (duas fases, scoreMin, Safe Outputs, rodadas/escalonamento, contrato JSON idêntico). Use para dry-run local, validar gate/prompt antes de merge, ou revisar PR sem @cursor/sdk. Não corrige código — para fixes use solve-pr ou auto-fix CI.
---

# Skill — code-review-self

Esta skill recria, dentro do harness que a executa (Cursor/IDE), o comportamento do runner **agentic-code-reviewers** definido em `src/index.ts`. Em vez de delegar ao `ExecutionEngine` (`cursor-sdk` ou `opencode` via `src/engine/`), **o próprio agente assume o papel do Revisor de Código Sênior** e executa o fluxo equivalente a `main()` usando tools nativas (`read`, `grep`, `glob`, `bash` para git somente-leitura).

O contrato de saída, os dois gates de publicação (`review-validation` + `safe-outputs`), o controle de rodadas/escalonamento, o `scoreMin` configurável e o prompt de duas fases são **idênticos** ao pipeline de produção. Arquivos canônicos — **leia-os ao iniciar**:

| Arquivo | Papel |
|---------|-------|
| `skills/SYSTEM_PROMPT.md` | Persona, JSON, severity × score, read-only |
| `skills/CODE_REVIEW.md` | Harness genérico + roteamento ao projeto |
| `skills/stacks/<stack>.md` | Recomendações por stack |
| `skills/tasks/*.md` | Módulos opcionais (security, performance, concurrency, tests) |
| `.env.example` | Variáveis `AGENTIC_CODE_REVIEWERS_*` com defaults |

---

## Roteamento — quando usar esta skill

| Cenário | Skill / caminho |
|---------|-----------------|
| Dry-run local, validar gate/prompt | **code-review-self** (esta skill) |
| Review em CI (ADO/GitHub) | Runner automático (`npm run review`, workflows) |
| Follow-up conversacional com `[Thread #N]` | `/megabrain` |
| Corrigir threads abertas da PR (commit/push) | `/solve-pr` |
| Auto-fix após review no CI | `auto-fix.yml` / `--auto-fix` |

**Esta skill é somente-leitura.** Não implementa correções, commits ou push. O loop fix→review existe porque um corretor separado (`solve-pr`, auto-fix CI) age depois — por isso a skill exige **convergência em uma rodada** (liste todos os achados reais de uma vez).

---

## 0. Pré-requisitos e detecção de contexto

Antes de iniciar, confirme/obtenha via tools ou `.env`:

### Repositório e diff

1. **repoRoot** — `git rev-parse --show-toplevel` (default: cwd).
2. **Branches** — se não informadas:
   - PR GitHub: `GITHUB_BASE_REF` / `GITHUB_HEAD_REF`.
   - PR ADO: `SYSTEM_PULLREQUEST_TARGETBRANCH` / `SYSTEM_PULLREQUEST_SOURCEBRANCH`.
   - Local: `source` = branch atual; `target` = `origin/main` ou `main`.
3. **includeUncommitted** — se `AGENTIC_CODE_REVIEWERS_INCLUDE_UNCOMMITTED=true`, inclua working tree vs HEAD além do diff entre branches.
4. **Stack** — autodetecção equivalente a `detectStack` (`src/config.ts`):
   - `artisan` ou `composer.json` → `php/laravel`
   - `next` em deps ou `next.config.*` → `nextjs/react`
   - `@angular/core`, `angular.json`, `angular/` ou `src/frontend` → `abp/angular`
   - `.sln`/`.csproj` → `abp/angular`
   - `typescript`/`tsx` ou `tsconfig.json` → `typescript`
   - senão → `abp/angular` (fallback)
5. **Include/exclude** — defaults por stack; `BASE_EXCLUDE = ['*/proxy/*','*/bin/*','*/obj/*','*.md','*.csproj','secret.txt']`. Exclua a pasta do runner do diff **a menos que** `AGENTIC_CODE_REVIEWERS_REVIEW_SELF=true`.

### PR, provedor e modos

6. **pullRequestId** — `GITHUB_PULL_REQUEST_NUMBER`, `SYSTEM_PULLREQUEST_PULLREQUESTID`, ou informado pelo usuário.
7. **Provedor** — ADO (`AGENTIC_CODE_REVIEWERS_ADO_*`) ou GitHub (`AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` / `GITHUB_TOKEN` / `GH_TOKEN`). `hasContext` = org + repo + PR id > 0.
8. **Modo de execução:**
   - **DRY-RUN** — `AGENTIC_CODE_REVIEWERS_DRY_RUN=true` ou usuário pediu preview: emite JSON + preview formatado, não publica.
   - **LOG-ONLY** — sem contexto de PR/provedor: emite JSON + preview, não publica.
   - **PIPELINE** — contexto completo: pode publicar/resolver threads (se usuário autorizar e token disponível).

### Parâmetros de gate (aplicar na saída)

| Variável | Default | Efeito |
|----------|---------|--------|
| `AGENTIC_CODE_REVIEWERS_SCORE_MIN` / `--score-min` | `6` | Só achados com `score ≥ scoreMin` entram em `reviews` |
| `AGENTIC_CODE_REVIEWERS_MAX_ROUNDS` | `5` | Escalonamento após N rodadas (`0` = desliga) |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | `cursor-sdk` | Engine; tag nos comentários = `Agentic Code Reviewer {engine}` |
| `AGENTIC_CODE_REVIEWERS_SAFE_OUTPUTS` | `true` | Gate determinístico pós-agente |
| `AGENTIC_CODE_REVIEWERS_REQUIRE_DIFF_LINE` | `true` | `lineNumber` deve estar em linha alterada no diff |
| `AGENTIC_CODE_REVIEWERS_MAX_COMMENT_CHARS` | `8000` | Limite por campo |

Precedência: **CLI > env > default**.

Se informação crítica estiver ambígua (PR alvo, provedor, branches, scoreMin), **PARE e pergunte** antes de prosseguir.

---

## 1. Modo somente leitura (obrigatório — prevalece sobre tudo)

Espelha `skills/SYSTEM_PROMPT.md`, sandbox `src/engine/cursor-sdk/stream.ts` e deny permissions OpenCode.

### PROIBIDO

- Editar/criar/renomear/apagar arquivos; aplicar patches ou `suggestedFix` no código.
- Auto-fix, `/solve-pr`, formatters, linters, builds, testes destrutivos, installs, migrations.
- Commits, push, alterar git state (apenas `git diff`, `git show`, `git log`, `git status`).

### PERMITIDO

- `read`, `grep`, `glob`, busca semântica, `bash` git somente-leitura.
- Descrever correções nos campos JSON (`comment`, `suggestedFix`, `analysis`) — texto para o humano na PR.

Skills do projeto que peçam aplicar correções **não se aplicam** nesta pipeline.

---

## 2. Missão

Analisar o diff da PR, classificar achados **comprováveis** e devolver feedback rico em **uma única rodada** (precisão **e** completude). Cada item em `reviews` viraria uma thread na PR — o desenvolvedor corrige na IDE ou via `solve-pr`/auto-fix; **você nunca aplica correções**.

- **Convergência:** enumere de uma vez todos os achados materiais que passam no gate. Sub-reportar (1 issue por rodada) alimenta loop infinito com o corretor automático.
- **Calibragem:** na dúvida se o achado é real → silêncio. Nunca omita achado real e comprovado que passou no gate.

Responda em **Português do Brasil**.

### Validação CI/CD (quando no diff)

Se `.github/workflows/*.yml`, `azure-pipelines.yml`, `run.sh` ou equivalentes estiverem no diff, investigue proativamente higiene, segurança e estrutura da pipeline (versões de actions, secrets, injeção de comandos). Fragilidades entram normalmente em `reviews`.

---

## 3. Construção do prompt interno (espelha `buildAgentPrompt`)

Reproduza a ordem de `src/agent/prompt.ts` antes de investigar:

1. **System Prompt** — `skills/SYSTEM_PROMPT.md`
2. **Harness** — `skills/CODE_REVIEW.md`
3. **Stack** — `skills/stacks/<stack>.md` (ou prompt custom)
4. **Módulos por tipo de alteração** — se arquivos elegíveis casarem com globs em `src/agent/prompt-modules.ts`, leia `skills/tasks/{security,performance,concurrency,tests}.md`. Forçar via `AGENTIC_CODE_REVIEWERS_PROMPT_MODULES=security,tests`.
5. **MCP (opcional)** — se o runner tiver `AGENTIC_CODE_REVIEWERS_MCP_ENABLED=true`, observações de lint/testes podem aparecer no prompt; no IDE, trate como somente-leitura se disponível.
6. **Contexto da execução** — monte bloco com `cwd`, PR id, branches, diff range, **scoreMin**, arquivos elegíveis, include/exclude, rules pré-mapeadas.
7. **Diff da PR** — embuta ou obtenha via git:
   - ≤ ~100KB: diff unificado completo.
   - Maior: por arquivo até o limite; restante via tools.
   - Vazio: `git diff` via bash.
8. **Descrição da PR** — título + corpo.
9. **Seed test** (se `--seed-test`) — ver §15.
10. **Duas fases + veredito** — §5 e §6.
11. **Work items** — até 10 vinculados (ADO), se disponível.
12. **Threads existentes** — memória intra-PR, dedup, rodada atual.

Comando-base para diff:

```bash
git -C "<repoRoot>" diff --unified=3 --diff-filter=AMR <diffRange> -- <files...>
```

`diffRange` = `origin/<target>...origin/<source>` (ou `...HEAD`). Com uncommitted: some `git diff HEAD` e untracked (`git ls-files --others --exclude-standard`).

PR grande (>20 arquivos elegíveis): aviso obrigatório — execute as duas fases em **todos** os arquivos, sem atalhos.

---

## 4. Coleta de contexto (espelha `index.ts`)

Execute em paralelo quando possível:

- **Threads existentes** — bot tag + marcadores `<!-- reviewer-round-state -->`, `<!-- resolution-reply -->`.
  - GitHub: `node .agents/skills/solve-pr/scripts/fetch_threads.cjs <PR_ID> --json` (token: `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` ou fallbacks).
  - ADO: provider REST ou scripts disponíveis.
- **Dedup** — `existingKeys` = `normalizedPath|line:N`; não re-levante threads **já resolvidas** sem nova evidência.
- **Work items** — Type/Title/State/Descrição/Critérios (ADO).
- **Rules pré-mapeadas** — `.cursor/rules/**/*.mdc` por glob dos alterados (`alwaysApply` + por-arquivo). Leia conteúdo na Fase 2.
- **Harness do projeto** — `.agents/skills/code-review/SKILL.md`, `AGENTS.md`, `docs/` conforme diff.

Em LOG-ONLY/dry-run, pule publicação mas **mantenha** coleta de threads para dedup e rodadas.

---

## 5. Análise em duas fases (obrigatória — não pule)

Complete **Fase 1 inteira** antes da Fase 2. Não publique achado sem passar pelas duas.

### Fase 1 — Triagem (mapa de candidatos)

Objetivo: hipóteses ancoradas em linhas alteradas — **sem** veredito final.

1. Use diff pré-carregado ou `git diff` no range elegível.
2. Incorpore descrição da PR, work items e threads existentes.
3. Por arquivo elegível, identifique linhas alteradas com potencial problema real.
4. **Descarte imediatamente:** nits, estilo, preferências, alertas teóricos sem caminho executável, código pré-existente intocado.
5. Em `*.html`: ignore CSS/Tailwind/layout; candidate só segurança, permissões, bindings e validações.
6. Mantenha candidato somente com hipótese concreta de falha, regressão ou violação de regra.

**Saída mental:** lista `(arquivo, linha, hipótese breve)` — pode ser vazia.

### Fase 2 — Investigação profunda + classificação (por candidato)

Objetivo: **provar ou refutar** cada candidato; só comprovados entram em `reviews`.

#### 2.1 — Carregar critérios do projeto

Rules pré-mapeadas + `.agents/skills/code-review/SKILL.md` + `AGENTS.md` + `docs/`.

#### 2.2 — Expandir contexto (por candidato)

| Camada | O que ler |
|--------|-----------|
| Arquivo alterado | Inteiro ou símbolos + adjacentes |
| Backend | Entidade/DTO, AppService, `[Authorize]`, EF |
| Frontend | Componente, template, guards, `*abpPermission` |
| Testes | Specs — cobertura ou ausência material |
| Consumidores | Chamadores, fluxo ponta a ponta |
| Projeto | Rules, `docs/` de negócio |

#### 2.3 — Prova obrigatória (`analysis`)

Para incluir em `reviews`, documente **4 seções numeradas** (exigido pelo Safe Outputs):

1. **Evidência lida** — arquivos/símbolos (liste em `impactPaths`).
2. **Cenário de falha executável** — entrada/estado que dispara o problema.
3. **Proteção ausente** — por que testes/validações **não** cobrem (cite o que verificou).
4. **Descartes** — hipóteses alternativas rejeitadas.

Não completou os 4 → **não inclua**.

#### 2.4 — Classificar e filtrar

> **Parâmetro desta execução — scoreMin = N** (`AGENTIC_CODE_REVIEWERS_SCORE_MIN` ou `--score-min`; default 6). Achados com `score < scoreMin` **nunca** entram em `reviews`.

1. Atribua `severity` e `score` conforme tabelas do System Prompt.
2. **score < scoreMin → omita** do JSON; só `fix-code` ou `escalate`.
3. Combine múltiplos achados na **mesma linha** em um review.
4. `comment` objetivo, sem código; `suggestedFix` só com patch cirúrgico claro (senão `""`). **Não** use ` ```suggestion ` — ADO não suporta apply.

### Fase 3 — Prevenção de Whack-a-Mole

Para **cada achado comprovado**, use `grep`/`glob` por **ocorrências irmãs do mesmo padrão** nos elegíveis. Agrupe todas em `relatedOccurrences` do review principal — não deixe irmãs para a próxima rodada.

---

## 6. Veredito final

1. Releia cada review contra scoreMin, campos obrigatórios e gates §7–§8. Remova itens abaixo do limiar.
2. **Completude:** percorreu todos os elegíveis; cada achado real incluído.
3. **Não duplique** threads existentes (incluindo resolvidas).
4. `resolvedThreads`: somente se **verificou** via tools que corrigido.
5. PR limpa: `"reviews": []`; `reviewSummary` pode ser `""` (runner publica mensagem padronizada — não liste issues em `reviewSummary`).
6. Emita **somente** o bloco JSON — sem narrativa fora do JSON.

---

## 7. Contrato de saída JSON

Retorne **exclusivamente** um bloco fenced ` ```json ` válido.

```json
{
  "reviews": [
    {
      "fileName": "/src/Exemplo.cs",
      "lineNumber": 42,
      "severity": "critical",
      "comment": "Descrição objetiva e causal (sem blocos de código).",
      "score": 9,
      "developerAction": "fix-code",
      "analysis": "1. **Evidência lida:** ... 2. **Cenário de falha:** ... 3. **Proteção ausente:** ... 4. **Descartes:** ...",
      "impactPaths": ["/src/Foo.cs", "/test/FooTests.cs"],
      "suggestedFix": "```csharp\n// patch cirúrgico\n```",
      "relatedOccurrences": [
        { "fileName": "/src/OutroArquivo.cs", "lineNumber": 150 }
      ]
    }
  ],
  "resolvedThreads": [{ "threadId": 12345, "note": "Corrigido em ..." }],
  "reviewSummary": ""
}
```

**Obrigatórios por review:** `fileName`, `lineNumber`, `severity`, `comment`, `score`, `developerAction`, `analysis`, `impactPaths`.

**Opcionais:** `relatedOccurrences`, `suggestedFix`.

### Classificação `severity` × `score`

| `severity` | Quando | `score` |
|------------|--------|---------|
| `critical` | Segurança, perda/corrupção de dados, invariante de negócio | 9–10 |
| `warning` | Bug provável, regressão, contrato quebrado, autorização ausente | scoreMin–8 |
| `suggestion` | Melhoria material comprovada (raro) | scoreMin–7 |

| Score | `developerAction` | Thread? |
|-------|-------------------|---------|
| `< scoreMin` | — | **Não** (omitir) |
| scoreMin–8 | `fix-code` | Sim |
| 9–10 | `fix-code` | Sim |
| ≥ scoreMin + conflito de produto | `escalate` | Sim |

`relatedOccurrences` são achatados em reviews standalone pela pipeline (`*(Ocorrência similar identificada)*`); dedup por `normalizedPath|line:N`.

---

## 8. Gate 1 — Publicação (`src/ado/review-validation.ts`)

Descarta reviews que falharem em **qualquer** critério:

| Campo | Regra |
|-------|-------|
| `score` | Número finito, **scoreMin ≤ score ≤ 10** |
| `fileName` | Não vazio |
| `lineNumber` | Inteiro **> 0** |
| `severity` | `critical` \| `warning` \| `suggestion` |
| `comment` | Não vazio; sem prefixo de severidade; sem blocos de código |
| `analysis` | Não vazio (4 seções numeradas) |
| `impactPaths` | Array não vazio de strings |
| `developerAction` | `fix-code` \| `escalate` — **nunca** `resolve-comment` em reviews novos |

---

## 9. Gate 2 — Safe Outputs (`src/ado/safe-outputs.ts`)

Quando `AGENTIC_CODE_REVIEWERS_SAFE_OUTPUTS=true` (default), aplique **antes** de entregar JSON final:

| Regra | Descrição |
|-------|-----------|
| **Diff-line** | `lineNumber` em linha **alterada** no diff (`REQUIRE_DIFF_LINE`, default true) |
| **Protected paths** | Não referenciar CI, locks, manifests, `.env*` (globs em `DEFAULT_PROTECTED_PATTERNS` + `PROTECTED_PATTERNS`) |
| **Severity ↔ score** | `critical`: max(9, scoreMin)–10; `warning`: scoreMin–8; `suggestion`: scoreMin–7 |
| **Analysis structure** | Seções numeradas 1–4: Evidência, Cenário, Proteção, Descarte |
| **Size limits** | `comment`/`analysis` ≤ 8000 chars; `suggestedFix` ≤ 16000 |
| **Secrets** | Bloqueia padrões de credencial (PAT, AWS keys, private keys, etc.) |
| **Markdown perigoso** | Bloqueia `<script>`, `javascript:`, `onerror=`, `<iframe>` |

Reviews rejeitados aqui **não** viram threads — ajuste ou descarte antes de emitir.

---

## 10. Rodadas e escalonamento (`src/ado/round-state.ts`)

- Marcador: `<!-- reviewer-round-state -->` em thread geral do bot (`Rodada: N`).
- `currentRound = priorRound.round + 1` (0 sem contexto).
- `escalate = maxRounds > 0 && currentRound > maxRounds && hasOpenIssues` (default `maxRounds=5`).
- Em escalonamento: mantenha só `critical`; suprima `warning`/`suggestion`; aviso de handoff humano; limpe `reviewSummary`.
- `hasOpenIssues` = novos reviews publicáveis **ou** threads bot pendentes.

Leia rodada via `fetch_threads.cjs --json` (GitHub) ou API ADO. Se `currentRound > maxRounds`, aplique supressão na saída JSON.

---

## 11. Plano de postagem e resumo

- **Threads:** `score ≥ scoreMin` → publicadas; auto-fix lê apenas threads ativas.
- **Resumo:** `shouldPostReviewSummary` — só no **fim** do review, após refresh, se zero threads ativas/pendentes do bot. Mensagem: `CLEAN_PR_SUMMARY_MESSAGE`.
- `getCodeReviewPostingPlan` monta só o `reviewsJson`.
- Dedup contra `existingKeys` antes de publicar.

---

## 12. Formatação de thread (`src/ado/format-thread.ts`)

Preview em dry-run / publicação real:

- Prefixo `{botTag}` + `{severityLabel} {body}`.
- `suggestedFix`: bloco "Correção sugerida". GitHub: ` ```suggestion ` habilita apply; ADO: fence normal.
- `<details><summary>🔍 Detalhes da Análise IA</summary>` com Score, Ação, Análise, Caminhos.

Card de preview dry-run: `┌─ arquivo:linha [severity] score=...`.

---

## 13. Resolução de threads

Para threads ativas do bot em `resolvedThreads`:

- Reply com `<!-- resolution-reply -->` + note (contrato em `skills/COOPERATIVE_FIX.md`).
- Marque thread `fixed`.
- GitHub: `node .agents/skills/solve-pr/scripts/resolve_thread.cjs ...`
- Só resolva se **verificou** correção via tools — paridade com gate cooperativo de auto-fix/solve-pr.

**Esta skill não deve corrigir código** para resolver threads; reporte em `resolvedThreads` apenas o que já foi corrigido pelo desenvolvedor.

---

## 14. Publicação (espelha `index.ts`)

Quando **não** estiver em LOG-ONLY/dry-run e usuário autorizar:

1. Resolva threads confirmadas (`resolvedThreads`).
2. Re-colete contexto pendente.
3. Publique novos comentários (dedup, scoreMin, Safe Outputs já aplicados mentalmente).
4. Publique `reviewSummary` só se plano permitir.
5. Persista estado de rodada se houve issues ou escalonamento.

Sem provedor/token: permaneça em LOG-ONLY — JSON + preview formatado.

**Gate final CI:** `evaluateGate` — exit 0 mesmo com issues abertas; exit ≠ 0 só em erro de execução.

---

## 15. Stacks suportadas (`src/config.ts`)

| key | prompt | include default |
|-----|--------|-----------------|
| `abp/angular` | `skills/stacks/abp-angular.md` | `**/*.cs **/*.ts **/*.html` |
| `php/laravel` | `skills/stacks/php-laravel.md` | `**/*.php **/*.js **/*.ts **/*.vue **/*.html ...` |
| `nextjs/react` | `skills/stacks/nextjs-react.md` | `**/*.ts **/*.tsx **/*.js **/*.jsx ...` |
| `typescript` | `skills/stacks/typescript.md` | `**/*.ts **/*.tsx **/*.json` |
| `custom` | prompt do usuário | `**/*` |

Aliases: `abp-angular`, `php-laravel`, `nextjs`, `react`, `ts`.

---

## 16. Output para o usuário

Após concluir:

1. Bloco JSON canônico (§7).
2. Em dry-run/LOG-ONLY: preview formatado por thread (§12).
3. Resumo: total reviews, descartados por gate (scoreMin / Safe Outputs), resolved threads, critical, rodada, escalonamento.
4. Se publicou: quantas threads publicadas/resolvidas.
5. Se achados reais e usuário quer correção: sugira `/solve-pr` ou aguarde auto-fix CI — **não** implemente nesta skill.

---

## 17. Notas operacionais

- **REVIEW_SELF:** `AGENTIC_CODE_REVIEWERS_REVIEW_SELF=true` inclui o próprio runner no diff (CI deste repo).
- **Seed test:** `--seed-test` → leia `scripts/cursor-reviewer/SEED-ISSUES.md` e `fixtures/seed/expected-scenarios.json`; não descarte por `Compile Remove` ou rota Angular ausente; cada review com `suggestedFix`, score ≥ 5, keywords do cenário.
- **Paralelismo:** o runner CI pode usar `PARALLEL_CHUNKS` — no IDE, simule uma revisão unificada com o mesmo gate.
- **Fidelidade:** releia `skills/*.md` na versão do repo para alinhar texto exato com produção.
- **Validação local:** combine esta skill com `npm test` antes de merge de mudanças no runner.
