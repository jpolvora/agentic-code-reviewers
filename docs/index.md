# Documentação — Agentic Code Reviewers

> Documentação completa de configuração, uso e integração do **agentic-code-reviewers** — Multi Agent Code Reviewer plugável para Azure DevOps, GitHub e extensível a novas plataformas/engines.

---

## Índice

- [Skills — roteamento e gestão](#skills--roteamento-e-gestão)
- [Portabilidade e Customização de Prompts](#portabilidade-e-customização-de-prompts)
- [Modos git (local vs CI)](#modos-git-local-vs-ci)
- [Arquivos elegíveis](#arquivos-elegíveis)
- [Resumo do review](#resumo-do-review)
- [Configuração (.env)](#configuração-env)
- [AGENTIC_CODE_REVIEWERS_SCORE_MIN (limiar de threads)](#agentic_code_reviewers_score_min-limiar-de-threads)
- [Alterar o modelo LLM](#alterar-o-modelo-llm)
- [Azure Pipelines](#azure-pipelines)
- [Como rodar localmente](#como-rodar-localmente)
- [Branches (source vs target)](#branches-source-vs-target)
- [Formato das threads](#formato-das-threads)
- [Resposta JSON do agente](#resposta-json-do-agente)
- [Seed issues](#seed-issues)
- [Exemplo de execução](#exemplo-de-execução)
- [Parâmetros CLI](#parâmetros-cli)
- [Variáveis de ambiente (pipeline)](#variáveis-de-ambiente-pipeline)
- [Troubleshooting](#troubleshooting)

---

## Skills — roteamento e gestão

Duas camadas — não confundir:

| Camada | Pasta | Carregamento |
|--------|-------|--------------|
| **Runtime (CI/produção)** | `skills/` | `buildAgentPrompt()` em cada `npm run review` |
| **IDE (desenvolvimento)** | `.agents/skills/` | Usuário invoca `/code-review-self`, `/megabrain`, `/solve-pr` |

Detalhes, fluxograma de decisão e checklist de manutenção: [`AGENTS.md`](../AGENTS.md#skills--roteamento-e-gestão).

Skills genéricas entre projetos: [workflow-skills](https://github.com/jpolvora/workflow-skills).

---

## Portabilidade e Customização de Prompts

O runner pode ser executado a partir de sua própria raiz e configurado para atuar em qualquer repositório Git alvo usando `--repo-root <caminho>` ou `AGENTIC_CODE_REVIEWERS_REPO_ROOT`. Por padrão, assume `../../` relativo à sua própria pasta (modo submódulo). Como repositório autônomo, detecta automaticamente a própria raiz.

| Arquivo | Editável | Descrição |
|---------|----------|-----------|
| `skills/SYSTEM_PROMPT.md` | Sim | Contrato: read-only, duas fases, schema JSON |
| `skills/CODE_REVIEW.md` | Sim | Roteamento para harness do projeto alvo |

**Fail-fast:** erros de validação/config/execução encerram com exit 1. Issues de review não bloqueiam.

---

## Modos git (local vs CI)

| Modo | Quando | Comportamento |
|------|--------|---------------|
| **Local** | Branch git atual = `--source-branch` | `HEAD` direto; diff `{targetRef}...HEAD` |
| **Local + uncommitted** | `--include-uncommitted` ou `--seed-test` | Staged/unstaged/untracked vs HEAD |
| **CI** | Detached HEAD ou branch diferente | `git fetch origin`; diff `origin/{target}...origin/{source}` |

Se a ref target não existir localmente, fetch mínimo de `origin/{target}` (`--depth=1`).

---

## Arquivos elegíveis

| Tipo | Padrões |
|------|---------|
| **Include** | `**/*.cs`, `**/*.ts`, `**/*.html`, `*.cs`, `*.ts`, `*.html` |
| **Exclude (base)** | `*/proxy/*`, `*/bin/*`, `*/obj/*`, `*.md`, `*.csproj`, `secret.txt` |
| **Exclude (self-review)** | Diretório do runner (dinâmico); fallback: `scripts/agentic-code-reviewers/**` ou legado `scripts/cursor-reviewer/**` |

| Variável | Default | Descrição |
|----------|---------|-----------|
| `AGENTIC_CODE_REVIEWERS_REVIEW_SELF` | `false` | Inclui o próprio runner no review |
| `AGENTIC_CODE_REVIEWERS_EXTRA_EXCLUDE_PATTERNS` | — | Globs extras separados por vírgula |

> Nomes legados (`CURSOR_REVIEWER_*`, `CURSOR_API_KEY`, `SCORE_MIN`) continuam funcionando como fallback.

Diff: `--diff-filter=AMR` (Added, Modified, Renamed). `--include-uncommitted` adiciona working tree.

---

## Resumo do review

O runner publica threads na PR mas **não reprova a build** (exit 0). Desenvolvedor trata as threads diretamente na PR.

- **Visibilidade ADO:** logging commands `##vso[task.logissue]` + `##vso[task.uploadsummary]`
- **Dry-run:** simula sem POST real; exit 0
- **Dedup:** chave `arquivoNormalizado\|line:N`
- **Resolução:** match por `threadId` ou `fileName`+`lineNumber`
- **ReviewSummary:** publicado só quando PR limpa (sem issues novas nem pendentes)

| Exit code | Significado |
|-----------|-------------|
| 0 | Execução ok (com ou sem issues) |
| 1 | Erro fatal |

---

## Configuração (.env)

```bash
cp .env.example .env
```

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY` | Sim | API key do Cursor |
| `AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT` | Não* | PAT para ADO local |
| `AGENTIC_CODE_REVIEWERS_MODEL` | Não | Modelo (default: `composer-2.5`) |
| `AGENTIC_CODE_REVIEWERS_TARGET_BRANCH` | Não | Branch de diff (default: `refs/heads/master`) |
| `AGENTIC_CODE_REVIEWERS_BOT_TAG` | Não | Tag do bot (default: `[Cursor Reviewer]`) |
| `AGENTIC_CODE_REVIEWERS_VERBOSE` | Não | Logs (default: `true`) |
| `AGENTIC_CODE_REVIEWERS_TIMEOUT_MS` | Não | Timeout (default: `600000`) |
| `AGENTIC_CODE_REVIEWERS_SANDBOX` | Não | Sandbox read-only (default: `true`) |
| `AGENTIC_CODE_REVIEWERS_DRY_RUN` | Não | Dry-run via env |
| `AGENTIC_CODE_REVIEWERS_ADO_ORG` | Não | Org ADO (local) |
| `AGENTIC_CODE_REVIEWERS_ADO_PROJECT` | Não | Projeto ADO |
| `AGENTIC_CODE_REVIEWERS_ADO_REPO` | Não | Repositório ADO |
| `AGENTIC_CODE_REVIEWERS_PR_ID` | Não | ID da PR |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | Não | Engine LLM: `cursor-sdk` (default) ou `opencode` |
| `AGENTIC_CODE_REVIEWERS_REPO_ROOT` | Não | Raiz do repositório alvo |
| `AGENTIC_CODE_REVIEWERS_SCORE_MIN` | Não | Score mínimo para publicar thread (default: `6`). **Opcional** |

Carregamento: `tsx --env-file-if-exists=.env`.

### `AGENTIC_CODE_REVIEWERS_SCORE_MIN` (limiar de threads)

Controla quais issues do agente viram threads na PR (`score >= scoreMin`). **Opt-in:** omitir env e `--score-min` mantém limiar **6**.

```bash
# .env — publicar também scores 4 e 5
AGENTIC_CODE_REVIEWERS_SCORE_MIN=4

# pontual na CLI (precedência sobre env)
npm run review -- --dry-run --score-min 4
```

---

## Alterar o modelo LLM

Prioridade: CLI `--model` > env `AGENTIC_CODE_REVIEWERS_MODEL` > default `composer-2.5`.

```bash
# .env
AGENTIC_CODE_REVIEWERS_MODEL=composer-2.5

# flag pontual
npm run review -- --dry-run --model claude-4.6-sonnet-medium-thinking
```

IDs comuns: `composer-2.5`, `composer-2.5-fast`, `claude-4.6-sonnet-medium-thinking`, `gpt-5.4-medium`.

---

## Azure Pipelines

Template: [`azure-pipelines-cursor-code-review.yml`](azure-pipelines-cursor-code-review.yml)

```bash
# como submódulo
cp agentic-code-reviewers/azure-pipelines-cursor-code-review.yml ./
```

### Variáveis do template

| Variável | Descrição |
|----------|-----------|
| `group: vg-agentic-code-reviewers` | Variable group com `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY` |
| `REVIEWER_DIR` | Path do projeto (default: `scripts/agentic-code-reviewers` ou legado `scripts/cursor-reviewer`) |
| `AGENTIC_CODE_REVIEWERS_TARGET_BRANCH` | Branch target |
| `AGENTIC_CODE_REVIEWERS_MODEL` | Modelo LLM |
| `AGENTIC_CODE_REVIEWERS_SCORE_MIN` | *(opcional)* Limiar de publicação; omitir = `6` |

### Pré-requisitos ADO

1. Variable group com `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY`
2. Build Service com permissão **Contribute to pull requests**
3. OAuth token habilitado
4. Agent pool `ubuntu-latest` + Node 22.13+

### Build Validation

Pipeline com `trigger: none` — dispara via Build Validation em PR. Exit 0 mesmo com issues.

### Variáveis detectadas automaticamente

`SYSTEM_PULLREQUEST_SOURCEBRANCH`, `SYSTEM_PULLREQUEST_TARGETBRANCH`, `SYSTEM_PULLREQUEST_PULLREQUESTID`, `SYSTEM_COLLECTIONURI`, `SYSTEM_TEAMPROJECT`, `BUILD_REPOSITORY_NAME`, `SYSTEM_ACCESSTOKEN`.

---

## Como rodar localmente

### Pré-requisitos

- Node.js 22.13+
- `npm install`
- `.env` com `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY`

### Dry-run básico

```bash
npm run review -- --dry-run
```

### Atalhos shell

```bash
./run-local.sh                          # menu interativo
./run-local.sh feat/minha-feature       # source explícita
```

```powershell
.\run-local.ps1
```

### Opções CLI

```bash
# Branch específica
npm run review -- --dry-run --source-branch refs/heads/nome-da-feature

# Target customizado
npm run review -- --dry-run \
  --source-branch refs/heads/feat/x \
  --target-branch refs/heads/develop

# Com contexto ADO
npm run review -- \
  --dry-run \
  --source-branch refs/heads/sua-feature \
  --org sua-org \
  --project SeuProjeto \
  --repo SeuProjeto \
  --pr-id 123
```

### Publicação real (sem `--dry-run`)

Requer contexto ADO completo + token (`AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT` ou `SYSTEM_ACCESSTOKEN`).

---

## Branches (source vs target)

| Branch | Origem | Default |
|--------|--------|---------|
| **Source** | PR branch / git atual / `--source-branch` | automático |
| **Target** | `--target-branch` / env | `refs/heads/master` |

Refs curtas (`master`) normalizadas para `refs/heads/...`.

---

## Formato das threads

**Issue (thread active):**

```
[Cursor Reviewer]

🛑 **CRITICAL:** Descrição objetiva...

**Correção sugerida:**

```csharp
// patch cirúrgico
```

<details>
<summary>🔍 Detalhes da Análise IA</summary>

**Score:** 8/10 | **Ação dev:** fix-code

**Análise:** ...
**Caminhos analisados:** /src/Foo.cs, /test/FooTests.cs
</details>
```

**Resumo positivo (thread closed):**

```
[Cursor Reviewer]
<!-- review-summary -->
Revisão concluída sem apontamentos.
```

---

## Resposta JSON do agente

Parser: último bloco ` ```json ` válido → fallback para último `{...}` com `reviews`.

```json
{
  "reviews": [
    {
      "fileName": "/src/Exemplo.cs",
      "lineNumber": 42,
      "severity": "critical",
      "comment": "Descrição objetiva",
      "score": 8,
      "developerAction": "fix-code",
      "analysis": "Evidência, cenário, proteções, descartes",
      "impactPaths": ["/src/Foo.cs"],
      "suggestedFix": "```csharp\n// patch\n```"
    }
  ],
  "resolvedThreads": [{ "threadId": 12345, "note": "..." }],
  "reviewSummary": ""
}
```

Campos obrigatórios: `fileName`, `lineNumber`, `severity`, `comment`, `score`, `developerAction`, `analysis`, `impactPaths`. `suggestedFix` opcional (fence por linguagem, nunca ` ```suggestion `). Score &lt; `AGENTIC_CODE_REVIEWERS_SCORE_MIN` (default 6) → descartado pelo gate TypeScript.

---

## Seed issues

Teste local com fixtures temporárias:

```bash
npm run test:seed
```

Sequência: `seed:install` → `--dry-run --seed-test` → avalia → `seed:uninstall`. Ver [`SEED-ISSUES.md`](SEED-ISSUES.md).

---

## Exemplo de execução

```
Agentic Code Reviewers
Modo: DRY-RUN
Source: refs/heads/feat/minha-feature → Target: refs/heads/master

━ Preparando repositório local ━
Repositório: /caminho/para/seu-projeto
Diff: master...HEAD (abc1234..def5678)
5 arquivo(s) elegível(is) no diff.

━ Processando resposta do agente ━
Reviews: 2 | Resolved threads: 0 | Has critical: true

━ DRY-RUN — JSON que seria publicado ━
{ ... }

━ Concluído ━
Agent: agent_abc | Run: run_xyz
=== Resumo do Agentic Code Reviewers ===
Reviews novos: 2 | Threads resolvidas: 0
Severidades: critical=1, warning=1, suggestion=0
Review: COM ISSUES PENDENTES
Pipeline: SUCESSO (exit 0)
```

---

## Parâmetros CLI

| Flag | Descrição |
|------|-----------|
| `--dry-run` | Sem publicação ADO; exit 0 |
| `--verbose` / `--quiet` | Controle de logs |
| `--source-branch REF` | Branch source |
| `--target-branch REF` | Branch target (default: `refs/heads/master`) |
| `--org`, `--project`, `--repo`, `--pr-id` | Contexto ADO |
| `--bot-tag TAG` | Tag do bot |
| `--model ID` | Modelo Cursor |
| `--engine NAME` | Engine: `cursor-sdk`, `cursor` ou `opencode` |
| `--repo-root PATH` | Raiz do repositório alvo |
| `--score-min N` | Score mínimo para thread (default: `6`; opt-in) |
| `--help` / `-h` | Ajuda |

---

## Variáveis de ambiente (pipeline)

| Variável | Origem |
|----------|--------|
| `AGENTIC_CODE_REVIEWERS_MODEL` | Variable group / pipeline var |
| `AGENTIC_CODE_REVIEWERS_SCORE_MIN` | *(opcional)* Variable group / pipeline var; omitir = default `6` |
| `AGENTIC_CODE_REVIEWERS_TARGET_BRANCH` | Variable group / pipeline var |
| `SYSTEM_PULLREQUEST_SOURCEBRANCH` | Pipeline ADO |
| `SYSTEM_PULLREQUEST_TARGETBRANCH` | Pipeline ADO |
| `SYSTEM_PULLREQUEST_PULLREQUESTID` | Pipeline ADO |
| `SYSTEM_COLLECTIONURI` | Pipeline ADO |
| `SYSTEM_TEAMPROJECT` | Pipeline ADO |
| `BUILD_REPOSITORY_NAME` | Pipeline ADO |
| `SYSTEM_ACCESSTOKEN` | Pipeline ADO |

---

## Troubleshooting

### `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY é obrigatório`

1. Confirme que `.env` existe
2. Verifique se a chave está preenchida (`AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY`; legado: `CURSOR_API_KEY`)
3. Use `npm run review` (carrega `--env-file=.env`)

### `Contexto ADO incompleto`

Fora da pipeline, use `--dry-run` ou passe `--org`, `--project`, `--repo`, `--pr-id`.

### `Token ADO ausente`

Pipeline: habilite **Allow scripts to access the OAuth token**. Local: `AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT` (legado: `AZURE_DEVOPS_EXT_PAT`).

### Nenhum arquivo elegível

Diff sem `.cs`, `.ts` ou `.html` revisáveis, ou todos excluídos.

### `Git error: fatal: ...`

`git fetch origin master` (ou a target configurada).

### JSON inválido na resposta

Rode com `--verbose` e inspecione a saída bruta do agente.

---

## Arquitetura Desacoplada e Suporte a Novas Plataformas

O **agentic-code-reviewers** é estruturado de forma a ser totalmente independente de plataformas e repositórios específicos. O core do agente se comunica com os ambientes externos exclusivamente através de abstrações plugáveis: `ExecutionEngine` (LLM/harness) e `PlatformProvider` (Git/CI).

### Engines agênticas (`ExecutionEngine`)

A camada LLM/harness é plugável via `AGENTIC_CODE_REVIEWERS_ENGINE`. Contrato em `src/engine/types.ts`:

| Engine | Status | Pacote |
|--------|--------|--------|
| `cursor-sdk` | Estável (default) | `@cursor/sdk` |
| `opencode` | Estável | `@opencode-ai/sdk` |
| Custom | Via PR | Seu adapter |

Para adicionar uma engine:
1. Implemente `ExecutionEngine` em `src/engine/<nome>/engine.ts`.
2. Estenda `ReviewerEngineName` e registre em `getEngine()` (`src/engine/index.ts`).
3. Retorne JSON no contrato de `skills/SYSTEM_PROMPT.md` via `EngineRunResult.fullText`.
4. Abra PR com testes.

### Provedores de Plataforma (`PlatformProvider`)

Toda a interação de leitura do contexto do repositório (Pull Request, commits, branches, threads de comentários e work items) e publicação de resultados (comentários na PR, resumo de review, logs de pipeline) é definida pelo contrato de interface em `src/provider/types.ts` (`PlatformProvider`).

Atualmente, existem dois adaptadores concretos implementados:
- **Azure DevOps (`AdoProvider`):** Lida com a integração com Azure DevOps Services e Azure Pipelines (ativado via `--ado` ou autodetecção de ambiente).
- **GitHub (`GithubProvider`):** Lida com a integração com GitHub e GitHub Actions (ativado via `--gh` ou autodetecção de ambiente).

### Como Adicionar Novas Plataformas (ex: GitLab, Bitbucket)

Para suportar novos ambientes de CI/CD e provedores Git:
1. Adicione a nova plataforma à união do tipo `provider` em `ReviewerConfig` (`src/config.ts`) e o mapeamento CLI (ex: `--gl` para GitLab).
2. Crie uma classe que implemente a interface `PlatformProvider` (por exemplo, `src/provider/gitlab.ts`).
3. Registre a nova classe no seletor do factory `getProvider` em `src/provider/index.ts`.

---

## Referências

| Recurso | Caminho |
|---------|---------|
| Fluxo de análise e decisão | [`docs/flow-analysis.md`](docs/flow-analysis.md) |
| FAQ | [`docs/faq.md`](docs/faq.md) |
| Score e severidade | [`docs/score_calc.md`](docs/score_calc.md) |
| Modelo de execução | [`docs/two-phase-execution-model.md`](docs/two-phase-execution-model.md) |
| Instruções de harness | `skills/CODE_REVIEW.md` |
| System Prompt / contrato JSON | `skills/SYSTEM_PROMPT.md` |
| Pipeline YAML | `azure-pipelines-cursor-code-review.yml` |
| Cursor SDK Docs | https://cursor.com/docs/sdk/typescript |
