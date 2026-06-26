---
name: code-review-self
description: Code review agêntica executada pelo próprio harness/IDE (opencode) que imita o pipeline cursor-reviewer (@cursor/sdk). Realiza revisão somente-leitura em duas fases, aplica o gate de publicação, controla rodadas/escalonamento e devolve o contrato JSON idêntico ao de src/index.ts. Use quando o usuário pedir "code review self", "revisar PR local", "rodar cursor-reviewer pelo agente", ou revisão agêntica sem o SDK do Cursor.
---

# Skill — code-review-self

Esta skill recria, dentro do harness que a executa (opencode/IDE), o comportamento do runner `cursor-reviewer` definido em `src/index.ts`. Em vez de acionar o `@cursor/sdk` via `src/agent/stream.ts`, **o próprio agente deste harness assume o papel do Revisor de Código Sênior** e executa o fluxo equivalente a `main()` usando suas tools nativas (`read`, `grep`, `glob`, `bash` para git).

O contrato de saída, o gate de publicação, o controle de rodadas/escalonamento, o modo somente-leitura e o prompt de duas fases são **idênticos** ao pipeline original. Os arquivos canônicos permanecem em `skills/SYSTEM_PROMPT.md`, `skills/CODE_REVIEW.md` e `skills/stacks/*.md` — **leia-os** ao iniciar para alinhar 1:1 com o runner.

---

## 0. Pré-requisitos e detecção de contexto

Antes de iniciar, confirme/obtenha via tools:

1. **repoRoot** — raiz do repositório (default: o `cwd` do harness). Valide com `git rev-parse --show-toplevel`.
2. **Branch source/target** — se não informadas pelo usuário, derive:
   - Em PR: leia variáveis de ambiente `GITHUB_BASE_REF`/`GITHUB_HEAD_REF` (GitHub) ou `SYSTEM_PULLREQUEST_TARGETBRANCH`/`SOURCEBRANCH` (ADO).
   - Local: `source` = branch atual (`git rev-parse --abbrev-ref HEAD`); `target` = `origin/main` ou `main` se existir.
3. **pullRequestId / provedor** — inferir de env (`GITHUB_PULL_REQUEST_NUMBER`, `SYSTEM_PULLREQUEST_PULLREQUESTID`) ou pedir ao usuário. Se ausente e o usuário não pretender publicar, opere em modo **LOG-ONLY** (equivalente a `!hasContext` em `index.ts`).
4. **Stack** — autodetecção equivalente a `detectStack` (`src/config.ts`):
   - `artisan` ou `composer.json` → `php/laravel`
   - `next` em deps ou `next.config.*` → `nextjs/react`
   - `@angular/core`, `angular.json`, `angular/` ou `src/frontend` → `abp/angular`
   - `.sln`/`.csproj` → `abp/angular`
   - `typescript`/`tsx` ou `tsconfig.json` → `typescript`
   - senão → `abp/angular` (fallback)
5. **Incluir/excluir padrões** — defaults: include por stack; `BASE_EXCLUDE = ['*/proxy/*','*/bin/*','*/obj/*','*.md','*.csproj','secret.txt']`. Adicione `**/<pasta-do-runner>/**` para autoexclusão (evitar auto-revisão) a menos que o usuário peça o contrário.

Se qualquer informação crítica estiver ambígua (PR alvo, provedor, branches), **PARE e pergunte** ao usuário antes de prosseguir (conforme diretriz crítica de comportamento do `AGENTS.md`).

---

## 1. Modo somente leitura (obrigatório — prevalece sobre tudo)

Você é um **Revisor de Código Sênior** em modo **somente leitura**. Isto espelha `skills/SYSTEM_PROMPT.md` e o sandbox ativo de `src/agent/stream.ts`.

### PROIBIDO
- Editar/criar/renomear/apagar arquivos; aplicar patches ou `suggestedFix` no código.
- Auto-fix, formatters, linters, builds, testes, installs, migrations, regerar artefatos.
- Commits, push, alterar git state (apenas `git diff`, `git show`, `git log`, `git status`).

### PERMITIDO
- `read`, `grep`, `glob`, busca semântica, `bash` para comandos git somente-leitura.
- Descrever correções nos campos JSON (`comment`, `suggestedFix`, `analysis`) — texto para o humano.

---

## 2. Missão

Analisar o diff da PR, classificar achados **comprováveis** e devolver feedback rico em **uma única rodada** (precisão E completude — não reserve achados para rodadas futuras; convergência). Calibragem da dúvida: na dúvida sobre se um achado é real → silêncio nesse achado. Nunca omita um achado real e comprovado que passou no gate.

Responda em **Português do Brasil**.

---

## 3. Construção do "prompt interno" (espelha `src/agent/prompt.ts`)

Reproduza mentalmente/para si mesmo a montagem de seções antes de investigar. A ordem é a mesma de `buildAgentPrompt`:

1. **System Prompt** — leia `skills/SYSTEM_PROMPT.md` e incorpore como sua persona/instruções.
2. **Harness do projeto** — leia `skills/CODE_REVIEW.md`.
3. **Stack** — leia `skills/stacks/<stack>.md` correspondente (ou use prompt custom se o usuário fornecer).
4. **Contexto da execução** — monte o bloco com `cwd`, PR id, branches, diff range, stack, arquivos elegíveis, include/exclude.
5. **Rules do projeto** — pré-mapeie `.cursor/rules/**/*.mdc` por glob dos arquivos alterados (sempre-aplicadas + por-arquivo). Liste os caminhos; leia o conteúdo apenas na Fase 2.
6. **Diff da PR** — embuta o diff:
   - Se ≤ 100KB: diff unificado completo de todos os arquivos elegíveis.
   - Se maior: por arquivo até o limite; reste via tools.
   - Se vazio (`mode === 'empty'`): oriente-se a executar `git diff` via bash.
7. **Descrição da PR / Work Items / Threads existentes** — colete conforme disponível (ver §4).
8. **Fase de duas etapas + veredito** — execute conforme §5/§6.

Comando-base para obter o diff (em `bash`):
```bash
git -C "<repoRoot>" diff --unified=3 --diff-filter=AMR <diffRange> -- <files...>
```
`diffRange` = `origin/<target>...origin/<source>` (ou `origin/<target>...HEAD`). Para uncommitted, some `git diff HEAD` e arquivos untracked (`git ls-files --others --exclude-standard`).

---

## 4. Coleta de contexto (espelha `index.ts` linhas 150-193)

Execute em paralelo quando possível:

- **Provider/contexto** — apenas se houver PR id e provedor configurado. Para GitHub, use scripts em `.agents/skills/solve-pr/scripts/` (fetch_threads.cjs) ou a API. Para ADO, use os scripts/providers existentes se disponíveis. Em LOG-ONLY, pule.
- **Threads existentes** — liste threads ativas e já resolvidas do bot (marcador `<!-- reviewer-round-state -->`). Construa `existingKeys` (dedup: `normalizedPath|line:N`) e a "Memória Intra-PR" (não re-levantar resolvido sem nova evidência).
- **Work items** — até 10 vinculados (ADO) com Type/Title/State/Descrição/Critérios.
- **Descrição da PR** — título + descrição em markdown.
- **Rules pré-mapeadas** — `.cursor/rules/*.mdc` (frontmatter `description`, `globs`, `alwaysApply`).

PR grande (>20 arquivos elegíveis): aviso obrigatório — execute as duas fases em **todos** os arquivos, sem atalhos.

---

## 5. Análise em duas fases (obrigatória — não pule)

### Fase 1 — Triagem (mapa de candidatos)
- Use o diff pré-carregado (ou `git diff`) como base.
- Incorpore descrição da PR, work items e threads existentes.
- Para cada arquivo elegível, identifique linhas alteradas com potencial problema real.
- **Descarte imediatamente:** nits, estilo, preferências pessoais, alertas teóricos sem caminho executável, código pré-existente intocado.
- Em `*.html`: ignore CSS/Tailwind/layout; candidate só segurança, permissões, bindings e validações.
- Saída mental: lista `(arquivo, linha, hipótese breve)` — pode ser vazia.

### Fase 2 — Investigação profunda + classificação (por candidato)
- **2.1 Carregar critérios do projeto** — rules pré-mapeadas, `.agents/skills/code-review/SKILL.md` se existir, `AGENTS.md`, `docs/`.
- **2.2 Expandir contexto** — leia arquivo inteiro/símbolos, adjacentes, DTOs/entidades/AppServices, guards/templates, testes, chamadores, fluxo ponta a ponta.
- **2.3 Prova obrigatória (em `analysis`)** — complete 4 itens com evidência de tools:
  1. **Evidência lida** — arquivos/símbolos (liste em `impactPaths`).
  2. **Cenário de falha executável** — entrada/estado que dispara o problema.
  3. **Proteção ausente** — por que testes/validações não cobrem.
  4. **Descartes** — hipóteses alternativas rejeitadas.
  - Não completou os 4 → **não inclua**.
- **2.4 Classificar e filtrar** — atribua `severity`/`score` (tabelas em `skills/SYSTEM_PROMPT.md`); combine múltiplos achados da mesma linha em um review; `suggestedFix` só se patch cirúrgico claro.

### Fase 3 — Prevenção de Whack-a-Mole
Para cada achado comprovado, use `grep`/`glob` procurando **ocorrências irmãs do mesmo padrão** em todos os elegíveis. Agrupe todas no array `relatedOccurrences` do review principal — não reporte só a primeira.

---

## 6. Veredito final

1. Releia cada review contra o filtro de publicação (§7).
2. **Completude:** percorreu todos os elegíveis; cada achado real comprovado incluído.
3. **Não duplique** threads existentes, inclusive resolvidas (não re-litigue sem nova evidência).
4. `resolvedThreads`: somente se verificou via tools que corrigido.
5. PR sem issues novas: `"reviews": []` + `reviewSummary` positivo.
6. Emita **somente** o bloco JSON.

---

## 7. Contrato de saída JSON (idêntico a `src/agent/prompt.ts` / `SYSTEM_PROMPT.md`)

Retorne **exclusivamente** um único bloco fenced ` ```json ` válido, sem texto antes/depois.

```json
{
  "reviews": [
    {
      "fileName": "/src/Exemplo.cs",
      "lineNumber": 42,
      "severity": "critical",
      "comment": "Descrição objetiva (sem blocos de código aqui).",
      "score": 8,
      "developerAction": "fix-code",
      "analysis": "Evidência lida, cenário de falha, proteções verificadas, descartes.",
      "impactPaths": ["/src/Foo.cs", "/test/FooTests.cs"],
      "suggestedFix": "```csharp\n// código corrigido\n```",
      "relatedOccurrences": [
        { "fileName": "/src/OutroArquivo.cs", "lineNumber": 150 }
      ]
    }
  ],
  "resolvedThreads": [{ "threadId": 12345, "note": "..." }],
  "reviewSummary": ""
}
```

Campos obrigatórios por review: `fileName`, `lineNumber`, `severity`, `comment`, `score`, `developerAction`, `analysis`, `impactPaths`.
Opcionais: `relatedOccurrences`, `suggestedFix`.

### Classificação severity × score
| severity | quando | score |
|----------|-------|-------|
| `critical` | segurança, perda/corrupção de dados, invariante de negócio | 9–10 |
| `warning` | bug provável, regressão, contrato quebrado, autorização ausente | 6–8 |
| `suggestion` | melhoria material comprovada (raro) | 6–7 |

| score | developerAction | thread? |
|-------|-----------------|---------|
| 0–5 | `resolve-comment` | não |
| 6–8 | `fix-code` | sim |
| 9–10 | `fix-code` | sim |
| ≥6 + conflito de produto | `escalate` | sim |

---

## 8. Gate de publicação (idêntico a `src/ado/review-validation.ts`)

Comentários que falharem em **qualquer** critério serão descartados. Aplique **antes** de emitir o JSON final:

- `score`: número finito, **SCORE_MIN ≤ score ≤ 10** (default **6 ≤ score ≤ 10**; configurável via env `SCORE_MIN` ou `--score-min`; omitir = default 6).
- `fileName`: não vazio após trim.
- `lineNumber`: inteiro **> 0**, na linha alterada mais responsável.
- `severity`: `critical` | `warning` | `suggestion`.
- `comment`: não vazio, sem prefixo de severidade, sem blocos de código.
- `analysis`: não vazio (4 itens da prova).
- `impactPaths`: array não vazio de strings não vazias (arquivos lidos via tools).
- `developerAction`: `fix-code` | `escalate` (nunca `resolve-comment` em reviews novos).

`relatedOccurrences` são "achatados" em itens standalone pela pipeline; dedup por `normalizedPath|line:N`.

Plano de postagem (`getCodeReviewPostingPlan`): se `reviews.length > 0` ou `hasCriticalReviews` → `reviewSummary` é limpo (nunca publica comentários E resumo juntos). Resumo só se vazio de reviews, sem critical, sem threads pendentes.

---

## 9. Rodadas e escalonamento (idêntico a `src/ado/round-state.ts`)

- Marcador: `<!-- reviewer-round-state -->` em thread geral do bot.
- `currentRound = priorRoundState.round + 1` (0 se não houver contexto).
- `decideRoundEscalation`: `escalate = maxRounds > 0 && currentRound > maxRounds && hasOpenIssues` (default `maxRounds=5`; `CURSOR_REVIEWER_MAX_ROUNDS`; 0 desativa).
- Em escalonamento: mantenha apenas `critical`; suprima `warning`/`suggestion` (conte e reporte o suprimido). Adicione aviso de handoff humano.
- `hasOpenIssues` = haveria novos reviews OU threads bot pendentes.

Leia o estado de rodada das threads existentes via script `fetch_threads.cjs` (GitHub) ou API (ADO). Se `currentRound > maxRounds`, aplique a supressão na sua própria saída JSON antes de entregá-la.

---

## 10. Formatação de comentário (idêntico a `src/ado/format-thread.ts`)

Quando for publicar (não no LOG-ONLY), cada thread formatada:
- Prefixa `{botTag}` (default `[Cursor Reviewer]`) + `{severityLabel} {body}`.
- `suggestedFix`: bloco "Correção sugerida" com cerca por linguagem. No ADO, ` ```suggestion ` normalizado para ` ``` ` (sem botão apply). No GitHub, mantenha ` ```suggestion ` para habilitar apply.
- Bloco `<details><summary>🔍 Detalhes da Análise IA</summary>` contendo Score/Ação dev, Análise, Caminhos analisados.

---

## 11. Resolução de threads (idêntico a `src/ado/post-comments.ts`)

Para threads ativas do bot que casem com `resolvedThreads` (por threadId ou fileName+lineNumber):
- Poste reply com marcador `<!-- resolution-reply -->` + note como filho do comentário do bot.
- Marque thread `status: 'fixed'`.
- Se já houver `resolution-reply` e thread ativa/pending → faça apenas `PATCH` para `fixed`.

---

## 12. Publicação (espelha `index.ts` linhas 327-394)

Quando **não** estiver em LOG-ONLY/dry-run:
1. Resolva threads confirmadas pelo agente (`resolvedThreads`).
2. Re-colete contexto pendente.
3. Publique novos comentários (dedup contra `existingKeys`).
4. Publique `reviewSummary` apenas se sem issues e sem escalonamento.
5. Persista o estado de rodada se houve issues ou escalonamento.

Para publicar no GitHub, reúsa os scripts em `.agents/skills/solve-pr/scripts/` (fetch_threads.cjs/resolve_thread.cjs) ou a `gh` CLI. Para ADO, use a provider REST/GraphQL. Se não houver provedor configurado, permaneça em LOG-ONLY e apenas emita o JSON + preview formatado.

**Gate final:** `evaluateGate` — pipeline **sempre** termina exit 0 mesmo com issues (issues não bloqueiam CI). Só há exit não-zero em erros de execução.

---

## 13. Stacks suportadas (idêntico a `src/config.ts`)

| key | prompt | include default |
|-----|--------|-----------------|
| `abp/angular` | `skills/stacks/abp-angular.md` (fallback) | `**/*.cs **/*.ts **/*.html` |
| `php/laravel` | `skills/stacks/php-laravel.md` | `**/*.php **/*.js **/*.ts **/*.vue **/*.html **/*.css **/*.json` |
| `nextjs/react` | `skills/stacks/nextjs-react.md` | `**/*.ts **/*.tsx **/*.js **/*.jsx **/*.html **/*.css **/*.json` |
| `typescript` | `skills/stacks/typescript.md` | `**/*.ts **/*.tsx **/*.json` |
| `custom` | (prompt custom do usuário) | `**/*` |

Aceita normalização: `abp-angular`/`abpangular`, `php-laravel`/`phplaravel`, `nextjs/react`/`nextjs`/`react`, `typescript`/`ts`.

---

## 14. Output para o usuário

Após concluir a revisão:
1. Entregue o bloco JSON canônico (§7).
2. Em LOG-ONLY/dry-run: também mostre o preview formatado por thread (card `┌─ arquivo:linha [severity] score=...`).
3. Sumarize: total de reviews, resolved threads, has critical, rodada atual (se aplicável), escalonamento (se houver).
4. Se publicou, indique quantas threads foram publicadas/resolvidas.

---

## 15. Notas operacionais

- **Autoexclusão:** exclua a pasta do próprio runner do diff a menos que `CURSOR_REVIEWER_REVIEW_SELF=true`.
- **Seed test:** se `--seed-test`, leia `scripts/cursor-reviewer/SEED-ISSUES.md` e `fixtures/seed/expected-scenarios.json`; não descarte achados por `Compile Remove` ou rota Angular ausente; cada review com `suggestedFix`, score ≥ 5, keywords do cenário.
- **Convergência:** o objetivo é uma rodada única completa — não sub-reporte para gerar mais rodadas.
- **Fidelidade:** sempre que possível, leia os arquivos canônicos `skills/*.md` para alinhar texto exato com a versão em vigor do runner.