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
- [Auto-Fix e self-healing](#auto-fix-e-self-healing)
- [Alterar o modelo LLM](#alterar-o-modelo-llm)
- [Engine OpenCode (`opencode`)](#engine-opencode-opencode)
- [Runner (`run.sh`)](#runner-runsh)
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
| `AGENTIC_CODE_REVIEWERS_REVIEW_SELF` | `false` | Inclui o runner no diff; mescla `*.yml`, `*.yaml`, `*.sh` nos includes da stack |
| `AGENTIC_CODE_REVIEWERS_EXTRA_EXCLUDE_PATTERNS` | — | Globs extras separados por vírgula |

> Credenciais sem prefixo: `CURSOR_API_KEY`, `OPENCODE_API_KEY`. Demais variáveis usam `AGENTIC_CODE_REVIEWERS_*`.

Diff: `--diff-filter=AMR` (Added, Modified, Renamed). `--include-uncommitted` adiciona working tree.

---

## Resumo do review

O runner publica threads na PR mas **não reprova a build** (exit 0). Desenvolvedor trata as threads diretamente na PR.

- **Visibilidade ADO:** logging commands `##vso[task.logissue]` + `##vso[task.uploadsummary]`
- **Dry-run:** simula sem POST real; exit 0
- **Dedup:** chave `arquivoNormalizado\|line:N`
- **Resolução:** match por `threadId` ou `fileName`+`lineNumber`
- **Threads:** publicadas quando `score ≥ AGENTIC_CODE_REVIEWERS_SCORE_MIN` (default 6) — critério para auto-fix enxergar issues
- **ReviewSummary:** publicado **no fim** do review, só quando **zero** threads ativas/pendentes do bot; mensagem fixa: `Todas as pendências foram resolvidas com sucesso! A PR está pronta para ser mesclada. 🚀`

| Exit code | Significado |
|-----------|-------------|
| 0 | Execução ok (com ou sem issues) |
| 1 | Erro fatal |

---

## Configuração (.env)

```bash
cp .env.example .env   # essencial; avançadas → README § Configuração avançada
```

**Nomenclatura:** runner TypeScript lê `AGENTIC_CODE_REVIEWERS_*` via `src/env.ts`. Credenciais sem prefixo: `CURSOR_API_KEY`, `OPENCODE_API_KEY` (esta última só `run.sh`/CI). Nomes legados `CURSOR_REVIEWER_*` **não são lidos** — migre pipelines ADO para `AGENTIC_CODE_REVIEWERS_*`.

| Variável | Obrigatório | Descrição |
|----------|-------------|-----------|
| `CURSOR_API_KEY` | Sim (`cursor-sdk`) | API key do Cursor |
| `OPENCODE_API_KEY` | Sim (`opencode` CI) | Chave OpenCode Go (`run.sh` → `auth.json`; não via `env.*`) |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | Não | `cursor-sdk` (default) ou `opencode` |
| `AGENTIC_CODE_REVIEWERS_MODEL` | Não | Modelo (default por engine) |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` | Não | Servidor externo; omitir = embutido |
| `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` | Não | Token GitHub local; fallback `GITHUB_TOKEN` / `GH_TOKEN` |
| `AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT` | Não | PAT ADO local |
| `AGENTIC_CODE_REVIEWERS_TARGET_BRANCH` | Não | Branch de diff (default: `refs/heads/master`) |
| `AGENTIC_CODE_REVIEWERS_REVIEW_SELF` | Não | Incluir runner no diff (default: `false`) |

Demais variáveis (OpenCode tuning, `SCORE_MIN`, `STACK`, `TIMEOUT_MS`, etc.): [`README.md`](../README.md) § Configuração avançada.

**Só `run.sh`:** `AGENTIC_CODE_REVIEWERS_REPO_URL`, `AGENTIC_CODE_REVIEWERS_RELEASE_BRANCH`, `AGENTIC_CODE_REVIEWERS_LOCAL`, `AGENTIC_CODE_REVIEWERS_USE_TSX`.

**Só workflow CI:** `AGENTIC_CODE_REVIEWERS_EXECUTION_MODE` (variável de repositório; não passa por `env.ts`).

Carregamento: `tsx --env-file-if-exists=.env`.

### `AGENTIC_CODE_REVIEWERS_SCORE_MIN` (limiar de threads)

Controla quais issues do agente viram threads na PR (`score >= scoreMin`). **Opt-in:** omitir env e `--score-min` mantém limiar **6**.

**Fluxo end-to-end (mesmo valor em `cursor-sdk` e `opencode`):**

| Etapa | Onde |
|-------|------|
| Config | `loadConfig()` — precedência `--score-min` > env > default `6` |
| Log | `index.ts`, `runner.ts` — `Score mínimo para threads: N` |
| Prompt | `prompt.ts` — contexto da execução + Fase 2.4 + veredito final |
| Gate | `isPublishableReview(review, scoreMin)` em `review-validation.ts` |
| Safe Outputs | `severity-score` usa `options.scoreMin` em `safe-outputs.ts` |
| Publicação | `parseCodeReviewResponse`, providers ADO/GitHub |

```bash
# .env — publicar também scores 4 e 5
AGENTIC_CODE_REVIEWERS_SCORE_MIN=4

# pontual na CLI (precedência sobre env)
npm run review -- --dry-run --score-min 4

# reusable workflow GitHub (input score_min)
with:
  score_min: '6'
```

Detalhes: [`score_calc.md`](score_calc.md) · [`faq.md`](faq.md) § 11.

---

### Auto-Fix e self-healing

Modo **`--auto-fix`** / `AGENTIC_CODE_REVIEWERS_AUTO_FIX=true` — correção automática de threads ativas (commit → build → resolução → push). **Review padrão permanece read-only**; auto-fix é ramo separado em `src/index.ts`.

| Componente | Arquivo |
|------------|---------|
| Orquestrador | `src/orchestrator/autofix-runner.ts` |
| Commit/push | `src/git/autofix-commit.ts`, `src/git/autofix-build.ts` |
| Prompt subagente | `skills/AUTO_FIX.md` |
| CI GitHub | `.github/workflows/auto-fix.yml` |
| Skill IDE (manual) | `.agents/skills/solve-pr/` |

Ciclo completo: [`auto-fix.md`](auto-fix.md).

---

### Safe Outputs e paralelismo

Gate determinístico pós-LLM (`src/ado/safe-outputs.ts`). Default: `AGENTIC_CODE_REVIEWERS_SAFE_OUTPUTS=true`. Usa o mesmo `config.scoreMin` do gate de publicação para consistência `severity` ↔ `score`.

| Variável | Default | Uso |
|----------|---------|-----|
| `AGENTIC_CODE_REVIEWERS_SAFE_OUTPUTS` | `true` | Master toggle |
| `AGENTIC_CODE_REVIEWERS_REQUIRE_DIFF_LINE` | `true` | Ancora `lineNumber` no diff |
| `AGENTIC_CODE_REVIEWERS_MAX_COMMENT_CHARS` | `8000` | Limite de tamanho |
| `AGENTIC_CODE_REVIEWERS_PROTECTED_PATTERNS` | built-in | Globs extras (CI, locks) |
| `AGENTIC_CODE_REVIEWERS_PARALLEL_CHUNKS` | `1` | Agentes paralelos in-process |
| `AGENTIC_CODE_REVIEWERS_META_REVIEWER` | `false` | Filtro LLM pós-merge |
| `AGENTIC_CODE_REVIEWERS_MCP_ENABLED` | `false` | Ferramentas read-only no prompt |

CLI de artefatos (stdout, sem post na PR): `--generate-commit-message`, `--generate-pr-description`, `--artifacts-only`.

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

## Engine OpenCode (`opencode`)

Com `AGENTIC_CODE_REVIEWERS_ENGINE=opencode`, o runner usa `@opencode-ai/sdk`. **Por padrão** sobe servidor embutido (`createEmbeddedOpencodeServer` → `opencode serve` em `127.0.0.1:4096`) e conecta o client — não é necessário `opencode serve` manual nem `AGENTIC_CODE_REVIEWERS_OPENCODE_URL`.

Durante `session.prompt`, o runner assina eventos SSE (`client.global.event`) e registra `[status]`, `[tool]`, `[reasoning]` (quando o modelo emite `message.part.updated` com `type: "reasoning"`) e, com `--verbose` (default), `[assistant]`. O stdout/stderr do processo `opencode serve` pode ser piped com `AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG=true` (default). Timeout HTTP alinhado a `AGENTIC_CODE_REVIEWERS_TIMEOUT_MS` via `AbortSignal` + `undici.fetch` (`fetch.ts`); cleanup pós-timeout usa `cleanupClient` sem herdar o sinal abortado.

| Variável / flag | Default | Uso |
|---|---|---|
| `AGENTIC_CODE_REVIEWERS_OPENCODE_STREAM_REASONING` | `true` | Stream de partes `reasoning` via SSE (`delta` ou diff de `part.text`) |
| `--verbose` / `AGENTIC_CODE_REVIEWERS_VERBOSE` | `true` | Stream de partes `text` (`[assistant]`); `--quiet` desativa |

Nem todo modelo/provedor expõe raciocínio em stream — se só aparecem `[tool]`/`[status]`, o provider pode não emitir partes `reasoning`.

### Configuração mínima (servidor embutido)

```bash
AGENTIC_CODE_REVIEWERS_ENGINE=opencode
AGENTIC_CODE_REVIEWERS_MODEL=opencode-go/deepseek-v4-flash
# opcional: AGENTIC_CODE_REVIEWERS_OPENCODE_HOSTNAME, _PORT, _AGENT, _BIN
# AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL=DEBUG   # default quando server log ON
```

Pré-requisitos: CLI `opencode` no `PATH` (fallback `~/.opencode/bin`); credenciais em `~/.local/share/opencode/auth.json` ou `OPENCODE_API_KEY`; porta `4096` livre (ou `AGENTIC_CODE_REVIEWERS_OPENCODE_PORT=0`).

Implementação: `src/engine/opencode/stream.ts`, `server.ts`, `server-config.ts`, `harness-instructions.ts`, `event-stream.ts` — permissões read-only na config embutida (`edit`/`bash`/`webfetch`/`external_directory`/`doom_loop`: `deny`; sem prompts interativos em CI).

**Harness do projeto (paridade com `cursor-sdk`):** o servidor embutido injeta `instructions` via `OPENCODE_CONFIG_CONTENT` (`buildOpencodeServerConfig` → `harness-instructions.ts`): `AGENTS.md`, `.opencode/AGENTS.md`, `.cursor/rules/*`, `.agents/skills/code-review/SKILL.md`, `docs/**/*.md`. OpenCode combina isso com `AGENTS.md`/`opencode.json` nativos do `repoRoot`. Com servidor **externo** (`AGENTIC_CODE_REVIEWERS_OPENCODE_URL`), o inject não se aplica — use `opencode.json` no repo alvo ou confie no prompt pré-mapeado do runner.

### Servidor externo (opcional)

Use quando já houver TUI ou `opencode serve` em execução:

```bash
AGENTIC_CODE_REVIEWERS_OPENCODE_URL=http://127.0.0.1:43147
```

Documentação OpenCode: [SDK](https://opencode.ai/docs/sdk/) · [Servidor](https://opencode.ai/docs/server/).

---

## Runner (`run.sh`)

Script portátil [`run.sh`](../run.sh) — executa o reviewer no diretório atual (`--repo-root` implícito).

| Modo | Uso | Artefato |
|------|-----|----------|
| **Remoto** (default) | Outros repositórios, `curl \| bash` | Clona branch `release`, `node dist/index.js` |
| **Local** (`--local`) | CI deste repo, dev | `npx tsx src/index.ts` no checkout |

### GitHub Actions — este repositório

[`.github/workflows/code-review.yml`](../.github/workflows/code-review.yml) usa `bash run.sh --local --gh ...`.

### GitHub Actions — repositórios consumidores

| Abordagem | Arquivo |
|-----------|---------|
| Reusable workflow (recomendado) | [`.github/workflows/review-remote.yml`](../.github/workflows/review-remote.yml) |
| Exemplo copy-paste | [`examples/consumer-github-workflow.yml`](../examples/consumer-github-workflow.yml) |

```yaml
jobs:
  review:
    uses: OWNER/agentic-code-reviewers/.github/workflows/review-remote.yml@release
    secrets:
      CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
```

### cURL direto (consumidor)

```bash
curl -fsSL https://raw.githubusercontent.com/OWNER/agentic-code-reviewers/release/run.sh | bash -s -- \
  --gh --pr-id 42 --source-branch feat/x --target-branch main
```

Variáveis: `AGENTIC_CODE_REVIEWERS_REPO_URL`, `AGENTIC_CODE_REVIEWERS_RELEASE_BRANCH` (default `release`), `AGENTIC_CODE_REVIEWERS_ENGINE`, `AGENTIC_CODE_REVIEWERS_LOCAL`, `AGENTIC_CODE_REVIEWERS_USE_TSX`, `OPENCODE_API_KEY` (OpenCode). Estas variáveis de `run.sh` **não** passam por `env.ts`.

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
| `group: vg-agentic-code-reviewers` | Variable group com `CURSOR_API_KEY` |
| `REVIEWER_DIR` | Path do projeto (default: `scripts/agentic-code-reviewers` ou legado `scripts/cursor-reviewer`) |
| `AGENTIC_CODE_REVIEWERS_TARGET_BRANCH` | Branch target |
| `AGENTIC_CODE_REVIEWERS_MODEL` | Modelo LLM |
| `AGENTIC_CODE_REVIEWERS_SCORE_MIN` | *(opcional)* Limiar de publicação; omitir = `6` |

### Pré-requisitos ADO

1. Variable group com `CURSOR_API_KEY`
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
- `.env` com `CURSOR_API_KEY`

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
[Agentic Code Reviewer cursor-sdk]

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
[Agentic Code Reviewer cursor-sdk]
<!-- review-summary -->
Todas as pendências foram resolvidas com sucesso! A PR está pronta para ser mesclada. 🚀
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

### `CURSOR_API_KEY é obrigatório` (engine cursor-sdk)

1. Confirme que `.env` existe
2. Verifique se a chave está preenchida (`CURSOR_API_KEY`)
3. Use `npm run review` (carrega `--env-file=.env`)

### `Contexto ADO incompleto`

Fora da pipeline, use `--dry-run` ou passe `--org`, `--project`, `--repo`, `--pr-id`.

### `Token ADO ausente`

Pipeline: habilite **Allow scripts to access the OAuth token**. Local: `AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT`.

### Nenhum arquivo elegível

Diff sem `.cs`, `.ts` ou `.html` revisáveis, ou todos excluídos.

### `Git error: fatal: ...`

`git fetch origin master` (ou a target configurada).

### JSON inválido na resposta

Rode com `--verbose` e inspecione a saída bruta do agente.

### OpenCode: `HeadersTimeoutError` / `fetch failed`

`session.prompt` só devolve HTTP quando o agente termina (tool calls + LLM). O client OpenCode usa `undici.fetch` com `headersTimeout`/`bodyTimeout` iguais a `AGENTIC_CODE_REVIEWERS_TIMEOUT_MS` (default 10 min), cancelamento via `AbortSignal` e detecção recursiva de `UND_ERR_HEADERS_TIMEOUT`/`UND_ERR_BODY_TIMEOUT`. Se o review demorar mais, aumente:

```bash
AGENTIC_CODE_REVIEWERS_TIMEOUT_MS=1200000 npm run review -- --dry-run --engine opencode ...
```

### `Resource not accessible by integration` ao resolver threads

O `GITHUB_TOKEN` padrão do Actions **publica** comentários com `pull-requests: write`, mas a mutação GraphQL `resolveReviewThread` costuma ser **rejeitada** para tokens de integração — mesmo em threads criadas pelo próprio bot.

O runner trata isso como aviso (não falha a pipeline): a reply de resolução pode ser postada, mas a thread permanece aberta na UI.

**Para habilitar resolução automática**, configure um PAT (classic `repo` ou fine-grained `pull_requests: write`) como secret `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` no repositório. Os workflows `code-review.yml` e `review-remote.yml` usam esse secret quando presente; caso contrário caem em `github.token`.

```yaml
# .github/workflows/code-review.yml (já suportado)
AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN: ${{ secrets.AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN || github.token }}
```

### OpenCode para após `Sessão criada` sem progresso

1. Confirme `opencode` no `PATH` e credenciais (`auth.json` ou `OPENCODE_API_KEY`)
2. Ative logs: `AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL=DEBUG` (default)
3. Verifique porta preferida livre, use `AGENTIC_CODE_REVIEWERS_OPENCODE_PORT=0` ou deixe o runner escolher porta livre automaticamente
4. Em CI não interativo, não use permissões `ask` — o runner nega automaticamente na config embutida

---

## Arquitetura Desacoplada e Suporte a Novas Plataformas

O **agentic-code-reviewers** é estruturado de forma a ser totalmente independente de plataformas e repositórios específicos. O core do agente se comunica com os ambientes externos exclusivamente através de abstrações plugáveis: `ExecutionEngine` (LLM/harness) e `PlatformProvider` (Git/CI).

### Engines agênticas (`ExecutionEngine`)

A camada LLM/harness é plugável via `AGENTIC_CODE_REVIEWERS_ENGINE`. Contrato em `src/engine/types.ts`:

| Engine | Status | Pacote |
|--------|--------|--------|
| `cursor-sdk` | Estável (default) | `@cursor/sdk` |
| `opencode` | Estável | `@opencode-ai/sdk` — servidor embutido (`createEmbeddedOpencodeServer`); SSE + server log; `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` opcional |
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
| Fluxo de Auto-Fix e Self-Healing | [`docs/auto-fix.md`](docs/auto-fix.md) |
| FAQ | [`docs/faq.md`](docs/faq.md) |
| Score e severidade | [`docs/score_calc.md`](docs/score_calc.md) |
| Modelo de execução | [`docs/two-phase-execution-model.md`](docs/two-phase-execution-model.md) |
| Instruções de harness | `skills/CODE_REVIEW.md` |
| System Prompt / contrato JSON | `skills/SYSTEM_PROMPT.md` |
| Pipeline YAML | `azure-pipelines-cursor-code-review.yml` |
| Cursor SDK Docs | https://cursor.com/docs/sdk/typescript |
