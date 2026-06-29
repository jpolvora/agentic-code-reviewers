# Agentic Code Reviewers — Multi Agent Code Reviewer

**Agentic Code Reviewers** é um revisor de Pull Requests **multi-agente**, **plugável**, **extensível**, **customizável** e **resiliente** para pipelines de CI/CD. Orquestra agentes LLM em modo **somente leitura** sobre o diff do repositório, guiado pelo harness do projeto (`.cursor/rules/`, `AGENTS.md`, skills de code-review).

| Dimensão | Suporte atual | Extensível |
| :--- | :--- | :--- |
| **Engines agênticas** | `cursor-sdk`, `opencode` | Sim — implemente `ExecutionEngine` e registre em `getEngine()` |
| **Plataformas Git/CI** | Azure DevOps, GitHub | Sim — implemente `PlatformProvider` |
| **Stacks tecnológicas** | ABP/Angular, PHP/Laravel, Next.js/React, TypeScript, Custom | Sim — adicione em `STACKS` + `skills/stacks/` |
| **Providers LLM** | Cursor nativo, OpenCode (Zen, Go, LM Studio, …) | Via engine custom ou OpenCode |

A execução do LLM é **plugável** via `AGENTIC_CODE_REVIEWERS_ENGINE`:

| Engine | Pacote | Quando usar |
| :--- | :--- | :--- |
| **`cursor-sdk`** (padrão) | [`@cursor/sdk`](https://cursor.com/docs/sdk/typescript) | CI/CD, pipelines, modelos Cursor nativos |
| **`opencode`** | [`@opencode-ai/sdk`](https://opencode.ai/docs/sdk/) | Dev local com [OpenCode](https://opencode.ai/) — servidor embutido por padrão; Zen, Go, LM Studio, etc. |
| **Custom** | Seu adapter | Fork, implemente `ExecutionEngine`, abra PR |

> **Contribua:** fork o repositório, adicione sua engine agêntica ou provedor de plataforma, revise localmente com `npm test` e `npm run test:seed`, e abra um PR. Novas engines e providers são bem-vindas.

O revisor publica threads acionáveis nas linhas afetadas da PR. **Não altera arquivos** no repositório; aplicar correções ou encerrar threads é decisão do desenvolvedor.

> [!IMPORTANT]
> **Modo somente leitura:** commits, push, formatters e scripts modificadores estão fora do escopo. No `cursor-sdk`, um sandbox reforça isso no nível do SDK; no `opencode`, permissões de escrita são negadas na config do servidor embutido.

---

## 📖 Documentação Complementar (`docs/`)

Para detalhes arquiteturais e teóricos profundos, consulte a pasta [`docs/`](docs/):

*   **[Fluxo de Análise e Decisão](docs/flow-analysis.md):** Guia completo de ciclo de vida, do carregamento de contexto ao gate final.
*   **[Fluxo de Auto-Fix e Self-Healing](docs/auto-fix.md):** Como configurar pipelines para corrigir código automaticamente e revalidar o review em um loop seguro.
*   **[Perguntas Frequentes (FAQ)](docs/faq.md):** Dúvidas comuns de configuração, comportamento do bot e regras.
*   **[Cálculo de Score e Severidade](docs/score_calc.md):** Rubrica detalhada do score (0–10) e severidades (`critical`, `warning`, `suggestion`).
*   **[Modelo de Execução em Duas Fases](docs/two-phase-execution-model.md):** Detalhes sobre a arquitetura de triagem e investigação profunda em um único agente.

---

## 🚀 Recursos Principais

*   **🔌 Multi-engine agêntico (`cursor-sdk` | `opencode` | custom):** Mesmo orquestrador (`src/index.ts`), prompt e gate; troca só a camada de execução LLM via `AGENTIC_CODE_REVIEWERS_ENGINE`. Qualquer harness pode implementar `ExecutionEngine`. Métricas de tokens normalizadas entre adapters.
*   **🔌 Integração multiprovedor (Azure DevOps & GitHub):** Provedor inferido pelo CI ou forçado com `--ado` / `--gh`.
*   **🧠 Memória Intra-PR e Agrupamento de Ocorrências (Anti Whack-a-mole):** O agente retém os padrões de erros passados da PR em seu contexto para caçar ativamente falhas recorrentes. Ao encontrar o mesmo erro espalhado pelo diff, ele agrupa as ocorrências (`relatedOccurrences`), sendo desdobradas pela pipeline em múltiplas threads sincronizadas publicadas de uma única vez.
*   **🗂️ Seleção e Autodetecção de Stacks Tecnológicas:** Permite executar a revisão focando nas extensões de arquivos e com recomendações de boas práticas específicas da stack selecionada (via `--stack` ou env `AGENTIC_CODE_REVIEWERS_STACK`). Caso nenhuma stack seja configurada, o runner tenta autodetectar a tecnologia analisando os arquivos da raiz do projeto (ex.: presença de `artisan`, `next.config.js`, `tsconfig.json` ou arquivos `.sln`/`.csproj`), caindo para `ABP/Angular` como fallback. O log indica explicitamente de onde a definição da stack foi carregada.
*   **📝 Sugestões Interativas:** 
    *   No **GitHub**, as correções sugeridas utilizam o formato nativo ` ```suggestion `, permitindo que o desenvolvedor aplique a correção na PR com um único clique.
    *   No **Azure DevOps**, que não suporta o recurso de sugestão interativa, as cercas são normalizadas automaticamente para blocos de código neutros (` ```csharp `, ` ```ts `, etc.), garantindo uma formatação limpa.
*   **⚖️ Garantia de Convergência (Orçamento de Rodadas):** Utiliza um contador de rodadas persistido em um comentário de estado (`<!-- reviewer-round-state -->`). Se as rodadas excederem o limite (default: 10) e continuarem ocorrendo issues abertas, o bot entra em **escalonamento**: publica apenas issues de severidade `critical` (segurança/quebra de negócio) e adiciona um aviso solicitando **revisão humana**.
*   **🔍 Mapeamento Automático de Regras:** Lê e filtra arquivos de regras locais `.cursor/rules/*.mdc` associados aos arquivos alterados no diff antes do início da análise pelo agente.
*   **📊 Relatórios e Visibilidade na Build:** 
    *   **Azure DevOps:** Emite logging commands (`##vso[task.logissue]`) e anexa um resumo markdown rico na tela de build (`##vso[task.uploadsummary]`).
    *   **GitHub:** Anexa um resumo markdown completo da revisão diretamente na página do workflow via `GITHUB_STEP_SUMMARY`.
*   **📦 Execução Remota via cURL:** Permite rodar o reviewer remotamente baixando apenas o script `run.sh` da branch `release`, dispensando o clone completo do repositório ou a presença de dependências de desenvolvimento.
*   **🔄 Auto-Fix e ciclo self-healing (GitHub):** Modo `--auto-fix` (ou workflow [`auto-fix.yml`](.github/workflows/auto-fix.yml)) lê threads ativas do bot, aplica correções cirúrgicas via subagentes (`skills/AUTO_FIX.md`), commit (`fix(#N): auto-fix issues from review threads [threadId, ...]`), **build de validação**, resolução de threads, push na branch da PR, e **publica sumário detalhado** (arquivos alterados, threads resolvidas com links) no PR — re-disparando code review. Proteções: build pós-commit, resolução parcial por linha alterada, `MAX_ROUNDS`, concurrency por PR, falha explícita se todos os engines falharem. Requer PAT com push (`AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN`). Detalhes: [`docs/auto-fix.md`](docs/auto-fix.md).
*   **📏 Limiar de publicação (`score_min`) end-to-end:** `AGENTIC_CODE_REVIEWERS_SCORE_MIN` / `--score-min` (precedência CLI > env > default **6**) controla quais achados viram threads — injetado no prompt, gate TypeScript (`isPublishableReview`) e Safe Outputs (`severity-score`). Mesmo valor para `cursor-sdk` e `opencode`.
*   **🤖 Skills agênticas do runner (`.agents/skills/`):** Skills versionadas neste repositório para uso no Cursor/IDE ao desenvolver ou operar o **agentic-code-reviewers**:
    *   **`code-review-self`** — Executa o pipeline de review (duas fases, gate, rodadas) pelo próprio agente do IDE, sem `@cursor/sdk`; útil para dry-run local e validação do comportamento do runner.
    *   **`megabrain`** — Revisão com threads persistentes (`[Thread #1]`, `[Thread #2]`, …); em rodadas seguintes avalia se cada thread foi `RESOLVED` ou permanece `UNRESOLVED`.
    *   **`solve-pr`** — Automatiza o ciclo cooperativo: busca todas as threads abertas no GitHub, aplica fixes, commit/push e aguarda nova rodada do reviewer.

---

## ⚙️ Engines de execução

O runner resolve a engine em `getEngine(config)` (`src/engine/index.ts`). O contrato é `ExecutionEngine.run()` → `EngineRunResult` (`fullText` JSON, `sessionId`, métricas). Qualquer harness ou SDK agêntico pode ser integrado implementando essa interface — o pipeline (diff, gate, rodadas, publicação) permanece o mesmo.

### Como adicionar uma engine customizada

1. Crie `src/engine/<sua-engine>/engine.ts` implementando `ExecutionEngine` (`src/engine/types.ts`).
2. Registre o nome em `ReviewerEngineName` e no `switch` de `getEngine()` (`src/engine/index.ts`).
3. Documente variáveis de ambiente e modelos suportados.
4. Adicione testes e abra PR.

O mesmo padrão se aplica a **novos provedores de plataforma** (`PlatformProvider` em `src/provider/`) — GitLab, Bitbucket e outros estão a caminho; contribuições são encorajadas.

### `cursor-sdk` (padrão)

Agente local via `@cursor/sdk` com sandbox read-only, streaming e uso de tokens do SDK.

```bash
# .env mínimo
AGENTIC_CODE_REVIEWERS_ENGINE=cursor-sdk   # ou omita (default)
AGENTIC_CODE_REVIEWERS_MODEL=composer-2.5
CURSOR_API_KEY=cursor_...
```

Modelos: IDs do Cursor (`composer-2.5`, `claude-sonnet-4-6`, etc.). Validação em `src/engine/cursor-sdk/model.ts`.

### `opencode`

Cliente para servidor [OpenCode](https://opencode.ai/docs/sdk/): sessão → `session.prompt` (com `model: { providerID, modelID }` derivado de `AGENTIC_CODE_REVIEWERS_MODEL`) → resposta do agente. Se o servidor rejeitar o model explícito, o engine repete o prompt usando o default do host. Credenciais ficam no **servidor** (`~/.local/share/opencode/auth.json`), não no `.env` do reviewer.

**Modo padrão — servidor embutido** (recomendado): o runner sobe sua própria instância via `createEmbeddedOpencodeServer` (`opencode serve`) com harness read-only (`OPENCODE_CONFIG_CONTENT`: permissões `deny`, `instructions` do projeto). **Não reutiliza** um `opencode serve` alheio na porta — sempre spawn próprio com a config embutida (use `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` só para servidor externo explícito).

Requer CLI `opencode` no `PATH` (ou `~/.opencode/bin` — `run.sh` exporta PATH após instalar em CI). Porta preferida `4096`; se ocupada, tenta sequência ou porta livre (`AGENTIC_CODE_REVIEWERS_OPENCODE_PORT=0` = só porta efêmera).

Durante o prompt, o runner assina SSE (`/global/event`): `[status]`, `[tool]`, `[reasoning]` (quando o modelo expõe; `AGENTIC_CODE_REVIEWERS_OPENCODE_STREAM_REASONING`, default ON), `[assistant]` com `--verbose` / `AGENTIC_CODE_REVIEWERS_VERBOSE` (default ON). Timeout alinhado a `AGENTIC_CODE_REVIEWERS_TIMEOUT_MS` via `AbortSignal` + `undici.fetch` com `headersTimeout`/`bodyTimeout` iguais ao timeout configurado (`src/engine/opencode/fetch.ts`); sessões abortadas usam `cleanupClient` sem herdar o sinal de cancelamento.

```bash
AGENTIC_CODE_REVIEWERS_ENGINE=opencode
AGENTIC_CODE_REVIEWERS_MODEL=opencode-go/deepseek-v4-flash
OPENCODE_API_KEY=sk-...                    # CI: run.sh grava auth.json (não lido por env.ts)
# opcional: AGENTIC_CODE_REVIEWERS_OPENCODE_HOSTNAME, _PORT (4096 | 0), _AGENT, _BIN
# AGENTIC_CODE_REVIEWERS_OPENCODE_KILL_PORT=false
# AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG=true
# AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL=DEBUG
```

Não defina `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` (ou deixe vazio). Logs esperados após `Sessão criada`: `Enviando prompt...`, `[status] busy`, `[tool] ...`, `[opencode-server] ...`.

**Modo alternativo — servidor externo** (TUI ou `opencode serve` já em execução):

```bash
# Terminal 1 (opcional)
opencode serve --hostname=127.0.0.1 --port=43147

# Terminal 2 — apontar para o servidor existente
AGENTIC_CODE_REVIEWERS_ENGINE=opencode
AGENTIC_CODE_REVIEWERS_MODEL=opencode-go/deepseek-v4-flash
AGENTIC_CODE_REVIEWERS_OPENCODE_URL=http://127.0.0.1:43147
```

Modelos: formato `provider/model` (ex.: `opencode-go/deepseek-v4-flash`, `anthropic/claude-sonnet-4-6`). Liste com `opencode models <provider>`.

> [!NOTE]
> Com `opencode`, credenciais LLM ficam no servidor (`auth.json` ou `OPENCODE_API_KEY`); `CURSOR_API_KEY` não é necessária. Com `cursor-sdk`, só `CURSOR_API_KEY` é exigida.

---

## 🛠️ Configuração de variáveis de ambiente

Todas as variáveis do runner TypeScript usam o prefixo **`AGENTIC_CODE_REVIEWERS_`**, exceto credenciais **`CURSOR_API_KEY`** e **`OPENCODE_API_KEY`** (sem prefixo; `OPENCODE_API_KEY` é consumida por `run.sh`/CI, não por `env.*`). Leitura centralizada: `src/env.ts` (`readEnv`, `ENV`, `env.*`). Detalhes e roteamento de skills: [`AGENTS.md`](AGENTS.md).

> **Migração:** nomes legados `CURSOR_REVIEWER_*` **não são mais lidos**. Use `AGENTIC_CODE_REVIEWERS_*`. Macros ADO não expandidas (ex.: `$(CURSOR_REVIEWER_MODEL)`) continuam caindo no default — atualize pipelines para `AGENTIC_CODE_REVIEWERS_MODEL`, etc.

Crie um arquivo `.env` na raiz do projeto (veja [.env.example](.env.example) — só o essencial):

```bash
cp .env.example .env
```

### Essenciais

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `CURSOR_API_KEY` | — | Chave do Cursor (obrigatória com engine `cursor-sdk`). |
| `OPENCODE_API_KEY` | — | Chave OpenCode Go (CI; `run.sh` instala CLI + `auth.json`). |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | `cursor-sdk` | Engine LLM: `cursor-sdk` ou `opencode`. |
| `AGENTIC_CODE_REVIEWERS_MODEL` | por engine | **`cursor-sdk`:** ID Cursor. **`opencode`:** `provider/model`. |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` | — | Servidor OpenCode **externo**. Omitir = embutido (padrão). |
| `AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT` | — | PAT ADO para testes locais. |
| `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` | — | Token GitHub (`solve-pr`, publicação, **resolver threads**). Fallback: `GITHUB_TOKEN`, `GH_TOKEN`. Em CI, `github.token` publica comentários mas **não** fecha threads — veja [Resolução de threads](#resolução-automática-de-threads-github). |
| `AGENTIC_CODE_REVIEWERS_TARGET_BRANCH` | `refs/heads/master` | Branch de comparação do diff. |
| `AGENTIC_CODE_REVIEWERS_REVIEW_SELF` | `false` | Incluir o runner no diff (CI deste repo). |

Preferir flags CLI quando possível: `--dry-run`, `--quiet`, `--stack`, `--score-min`, `--engine`, `--model`.

### Configuração avançada

Defaults sensatos — omita salvo necessidade explícita.

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_HOSTNAME` | `127.0.0.1` | Host do servidor embutido. |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_PORT` | `4096` | Porta preferida (`0` = porta livre). |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_KILL_PORT` | `false` | Mata ocupante da porta preferida. |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_BIN` | PATH / `~/.opencode/bin` | Caminho do CLI OpenCode. |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_AGENT` | `explore` | Agente read-only na sessão. |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_SERVER_LOG` | `true` | Pipe stdout/stderr do `opencode serve`. |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_LOG_LEVEL` | `DEBUG` | Nível do servidor embutido. |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_STREAM_REASONING` | `true` | Stream SSE `[reasoning]`. |
| `AGENTIC_CODE_REVIEWERS_VERBOSE` | `true` | Logs; `[assistant]` no SSE (`--quiet` desativa). |
| `AGENTIC_CODE_REVIEWERS_TIMEOUT_MS` | `600000` | Timeout da sessão (10 min). |
| `AGENTIC_CODE_REVIEWERS_SANDBOX` | `true` | Sandbox read-only do `cursor-sdk`. |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | `cursor-sdk` | Engine LLM; define a tag nos comentários (`Agentic Code Reviewer {engine}`) |
| `AGENTIC_CODE_REVIEWERS_MAX_ROUNDS` | `10` | Rodadas antes do handoff humano. |
| `AGENTIC_CODE_REVIEWERS_SCORE_MIN` | `6` | Score mínimo para publicar thread (prompt + gate + Safe Outputs). |
| `AGENTIC_CODE_REVIEWERS_AUTO_FIX` | `false` | Ativa modo auto-fix (`--auto-fix`). |
| `AGENTIC_CODE_REVIEWERS_AUTO_FIX_BUILD_COMMAND` | auto (`npm test` se `scripts.test`, senão `npm run build`) | Validação pós-commit antes de resolver threads/push; string vazia desabilita. |
| `AGENTIC_CODE_REVIEWERS_SAFE_OUTPUTS` | `true` | Gate determinístico pós-LLM (diff-line, protected paths, secrets). |
| `AGENTIC_CODE_REVIEWERS_PARALLEL_CHUNKS` | `1` | Agentes paralelos in-process por chunk de arquivos. |
| `AGENTIC_CODE_REVIEWERS_META_REVIEWER` | `false` | Segunda passagem LLM para filtrar candidatos paralelos. |
| `AGENTIC_CODE_REVIEWERS_MCP_ENABLED` | `false` | Injeta ferramentas MCP read-only no prompt. |
| `AGENTIC_CODE_REVIEWERS_PROMPT_MODULES` | auto | Força módulos `skills/tasks/*` (ex. `security,performance`). |
| `AGENTIC_CODE_REVIEWERS_STACK` | autodetect | Stack ou `Custom`. |
| `AGENTIC_CODE_REVIEWERS_CUSTOM_PROMPT` | — | Prompt quando `stack=Custom`. |
| `AGENTIC_CODE_REVIEWERS_INCLUDE_PATTERNS` | stack | Globs de inclusão (CSV). |
| `AGENTIC_CODE_REVIEWERS_EXTRA_EXCLUDE_PATTERNS` | — | Globs extras de exclusão. |
| `AGENTIC_CODE_REVIEWERS_REPO_ROOT` | auto | Raiz do repositório alvo. |
| `AGENTIC_CODE_REVIEWERS_DRY_RUN` | `false` | Preferir `--dry-run`. |
| `AGENTIC_CODE_REVIEWERS_SEED_TEST` | `false` | Habilita testes com fixtures de defeitos para validação E2E local. |
| `AGENTIC_CODE_REVIEWERS_INCLUDE_UNCOMMITTED` | `false` | Inclui mudanças não comitadas no diff local (staging/unstaged). |
| `AGENTIC_CODE_REVIEWERS_PR_ID` | CI auto | Override explícito do ID da Pull Request. |
| `AGENTIC_CODE_REVIEWERS_ADO_ORG` | CI auto | Override explícito da organização ADO. |
| `AGENTIC_CODE_REVIEWERS_ADO_PROJECT` | CI auto | Override explícito do projeto ADO. |
| `AGENTIC_CODE_REVIEWERS_ADO_REPO` | CI auto | Override explícito do repositório ADO. |
| `AGENTIC_CODE_REVIEWERS_PROMPT_COLOR` | `true` | Cores ANSI no log do terminal (`false` para desativar). |

**Só `run.sh`** (shell; não passam por `env.ts`): `AGENTIC_CODE_REVIEWERS_REPO_URL`, `AGENTIC_CODE_REVIEWERS_RELEASE_BRANCH`, `AGENTIC_CODE_REVIEWERS_LOCAL`, `AGENTIC_CODE_REVIEWERS_USE_TSX`.

**Só workflow CI:** variável de repositório `AGENTIC_CODE_REVIEWERS_EXECUTION_MODE` (`parallel` \| `sequential`); controla a matrix do workflow — **não** é lida pelo runner TypeScript.

---

## 💻 Uso e Parâmetros da CLI

Para rodar localmente ou customizar a execução em scripts:

```bash
npm run review -- [argumentos]
```

### Argumentos da CLI

*   `--dry-run` : Simula toda a execução, gerando o JSON de reviews no console e renderizando previews estruturados das threads, sem publicar nada na PR real.
*   `--include-uncommitted` : Inclui alterações não commitadas (staged/unstaged/untracked) no escopo do diff vs HEAD.
*   `--seed-test` : Roda a suite de validação local de detecção baseada no arquivo `SEED-ISSUES.md`.
*   `--source-branch <REF>` : Sobrescreve localmente a branch de origem.
*   `--target-branch <REF>` : Sobrescreve a branch de destino do diff (ex: `refs/heads/develop`).
*   `--repo-root <CAMINHO>` : Define o diretório do repositório Git alvo (deve conter uma pasta `.git` válida).
*   `--ado` ou `--gh` : Força a plataforma do provedor (Azure DevOps ou GitHub).
*   `--org <NOME>`, `--project <NOME>`, `--repo <NOME>`, `--pr-id <ID>` : Passa o contexto do repositório e ID da Pull Request explicitamente para execução local.
*   `--stack <NOME>` ou `--stack=<NOME>` : Define a stack tecnológica ativa para o review (`ABP/Angular`, `PHP/Laravel`, `Next.js/React`, `TypeScript`, `Custom`).
*   `--custom-prompt <VAL>` : Caminho do arquivo ou string de prompt quando a stack é `Custom` (requerido para `--stack=Custom`).
*   `--include-patterns <VAL>` : Lista separada por vírgulas de padrões glob de inclusão (ex.: `**/*.py,**/*.go`). Sobrescreve o padrão de arquivos a incluir no diff.
*   `--model <id>` : Modelo LLM — ID Cursor no engine `cursor-sdk` (`composer-2.5`) ou `provider/model` no `opencode` (`opencode-go/deepseek-v4-flash`). Sobrescreve `AGENTIC_CODE_REVIEWERS_MODEL`.
*   `--engine <name>` : Engine LLM: `cursor-sdk`, `cursor` ou `opencode`. Sobrescreve `AGENTIC_CODE_REVIEWERS_ENGINE`.
*   `--verbose` / `--quiet` : Controle de logs (`AGENTIC_CODE_REVIEWERS_VERBOSE`). Com `opencode`, `--quiet` desativa stream `[assistant]`.
*   `--score-min <N>` ou `--score-min=<N>` : Score mínimo (inclusive) para publicar issue como thread (default: `6`). Equivalente à variável `AGENTIC_CODE_REVIEWERS_SCORE_MIN`. **Opcional** — pipelines e scripts existentes que não passam este parâmetro continuam com limiar 6. Injetado no prompt e aplicado pelo gate TypeScript + Safe Outputs (mesmo valor em `cursor-sdk` e `opencode`).
*   `--auto-fix` : Modo correção automática — lê threads ativas do bot, aplica fixes via subagentes, commit/push e resolve threads (requer contexto de PR e token com escrita). Equivalente a `AGENTIC_CODE_REVIEWERS_AUTO_FIX=true`. **Mutuamente exclusivo** com o fluxo de review padrão na mesma invocação.

> Engine também pode ser definida por `AGENTIC_CODE_REVIEWERS_ENGINE` no ambiente; `--engine` tem precedência. A tag nos comentários da PR é derivada automaticamente: `Agentic Code Reviewer {engine}`.

> **Nota:** `AGENTIC_CODE_REVIEWERS_SCORE_MIN` e `--score-min` são opt-in. Sem configurá-los, o gate permanece **6–10**.

---

## 🔄 Fluxo de Execução

```
[PR Aberta/Atualizada]
        │
        ▼
[Inicialização e Configuração] ──► Lê src/env.ts (AGENTIC_CODE_REVIEWERS_*), resolve args da CLI e credenciais
        │
        ▼
[Autodetecção de Stack] ──► Infere stack baseada na raiz (package.json, sln, tsconfig) ou usa `--stack`
        │
        ▼
[Preparar Workspace Git] ──► Gera diff (HEAD vs TARGET_BRANCH) filtrado pelos patterns da stack
        │
        ▼
[Coletar Contexto do Provedor] ──► Puxa Work Items linkados + Threads ativas do bot (Anti Whack-a-mole)
        │
        ▼
[Resolução da Engine LLM] ──► getEngine(config) decide qual adapter instanciar (cursor-sdk ou opencode)
        │
        ▼
[Inicialização da Engine] ──► `cursor-sdk`: Inicia cliente | `opencode`: Sobe servidor embutido e assina stream SSE
        │
        ▼
[Montagem do Prompt] ──► Injeta SYSTEM_PROMPT, scoreMin, regras da stack, rules locais (.cursor/rules/) e diff
        │
        ▼
[Execução do Agente (2 Fases)] ──► (Timeout e stream de raciocínio gerenciados pela engine)
   ├─ Fase 1: Triagem ──► Formulação de hipóteses sobre o diff (apenas linhas alteradas)
   └─ Fase 2: Investigação ──► O agente prova/refuta vulnerabilidades usando tools (read, grep) no sandbox
        │
        ▼
[Gate de Validação e Formatação] ──► isPublishableReview(scoreMin) + Safe Outputs
        │
        ▼
[Publicação na PR]
   ├─ Azure DevOps: Normaliza cercas, publica threads, fecha threads antigas e atualiza Estado da Rodada
   └─ GitHub: Publica threads com ```suggestion, fecha antigas e injeta resumo no GITHUB_STEP_SUMMARY
        │
        ▼
[Auto-Fix opcional — GitHub CI] ──► workflow_run → auto-fix.yml → --auto-fix → push → novo code review
        │
        ▼
[Teardown e Fim da Execução] ──► Encerra processos (kill opencode), Exit 0 (sucesso) ou 1 (falhas de sistema)
```

---

## 🗂️ Seleção e Autodetecção de Stacks

O **Agentic Code Reviewers** permite focar a análise em arquivos elegíveis específicos e injetar recomendações de boas práticas direcionadas para cada ecossistema tecnológico.

### ⚙️ Como Definir a Stack
Você pode definir a stack de três formas (em ordem de prioridade):
1.  **Parâmetro CLI:** `--stack=<nome-da-stack>` (ex.: `--stack=PHP/Laravel`).
2.  **Variável de Ambiente:** `AGENTIC_CODE_REVIEWERS_STACK=<nome-da-stack>`.
3.  **Autodetecção Automática:** Caso não seja especificada nenhuma das opções anteriores.

### 🎨 Stack Customizada (`Custom`) e Prompt Customizado

Se você precisa rodar o revisor em um projeto cuja tecnologia/stack não está pré-definida nas opções padrão, ou se deseja ter total controle das diretrizes de revisão da stack, você pode utilizar a stack `Custom`.

Quando a stack `Custom` é selecionada, o runner:
1. **Requer** que você informe um prompt customizado via `--custom-prompt` (ou pela variável `AGENTIC_CODE_REVIEWERS_CUSTOM_PROMPT`).
2. Adota, por padrão, a inclusão de todos os arquivos (`**/*`) no diff de revisão, a menos que seja definido o parâmetro `--include-patterns` (ou a variável `AGENTIC_CODE_REVIEWERS_INCLUDE_PATTERNS`).

#### Exemplos de Linhas de Comando:

* **Exemplo 1: Passando o caminho de um arquivo de prompt customizado (recomendado para CI):**
  ```bash
  npm run review -- --dry-run --stack=Custom --custom-prompt=./my-pipeline-prompt.md
  ```

* **Exemplo 2: Passando o prompt diretamente como string:**
  ```bash
  npm run review -- --dry-run --stack=Custom --custom-prompt="Evite o uso de variáveis globais e garanta tipagem estrita de retorno em todas as funções públicas."
  ```

* **Exemplo 3: Limitando os arquivos analisados pela stack customizada (por exemplo, Python e Go):**
  ```bash
  npm run review -- --dry-run --stack=Custom --custom-prompt=./custom-rules.md --include-patterns="**/*.py,**/*.go"
  ```

* **Exemplo 4: Utilizando variáveis de ambiente (comum em arquivos de Pipeline/GitHub Actions):**
  ```bash
  export AGENTIC_CODE_REVIEWERS_STACK="Custom"
  export AGENTIC_CODE_REVIEWERS_CUSTOM_PROMPT="./config/reviewer-prompt.md"
  export AGENTIC_CODE_REVIEWERS_INCLUDE_PATTERNS="**/*.rs,**/*.toml"
  npm run review -- --dry-run
  ```

### 🔍 Estratégia de Autodetecção
Quando ativada, a estratégia de autodetecção analisa a raiz do repositório (`repoRoot`) e infere a tecnologia baseada nas seguintes regras:
*   **PHP/Laravel:** Identificado se houver o arquivo `artisan` ou `composer.json` na raiz.
*   **Next.js/React:** Identificado por arquivos como `next.config.js` / `.mjs` / `.ts` ou pelo pacote `next` nas dependências do `package.json`.
*   **ABP/Angular:** Identificado por arquivos `angular.json`, diretório `angular/` ou pelo pacote `@angular/core`.
*   **C#/.NET (ABP/Angular):** Identificado por soluções `.sln` ou arquivos `.csproj` na raiz.
*   **TypeScript:** Identificado por `tsconfig.json` ou pelos pacotes `typescript` / `tsx`.

> [!TIP]
> **Ordem de Precedência na Detecção:** Arquivos de solução C# `.sln` e `.csproj` são checados *antes* de `tsconfig.json` genéricos. Isso garante que backends ABP/.NET Core que possuam um `tsconfig` na raiz para fins de tooling não sejam erroneamente detectados como TypeScript puro.

### 🔄 Fallback e Segurança
*   **Fallback Padrão:** Se nenhuma tecnologia for autodetectada ou especificada, o runner adota a stack `ABP/Angular` (mantendo 100% de compatibilidade com o comportamento original).
*   **Tratamento de Macros ADO:** Caso a variável de ambiente `AGENTIC_CODE_REVIEWERS_STACK` contiver uma macro não expandida do Azure DevOps (como `$(AGENTIC_CODE_REVIEWERS_STACK)`), ela será resolvida automaticamente para a stack padrão.
*   **Seed Tests:** Ao rodar a suíte local com a flag `--seed-test`, o runner força a execução na stack `ABP/Angular` para garantir a detecção correta das fixtures C#/.NET.

### 🔌 Como Estender e Adicionar Nova Stack
A arquitetura é modular e extensível. Para adicionar suporte a uma nova stack tecnológica:
1.  **Registrar no Config:** Abra `src/config.ts` e adicione a nova definição ao dicionário `STACKS`, mapeando o nome amigável, os padrões de arquivos do diff (`includePatterns`) e o nome do arquivo de prompt (ex.: `meu-framework.md`).
2.  **Mapear o Alias:** No mesmo arquivo, atualize a função `getStackConfig` com as chaves e aliases de normalização da sua stack.
3.  **Criar o Prompt:** Crie o arquivo markdown correspondente em `skills/stacks/meu-framework.md` detalhando as instruções específicas e preocupações comuns de revisão de código para aquela tecnologia.

---

### Skills locais do runner (`.agents/skills/`)

Skills para o **Cursor/IDE** — distintas dos prompts em `skills/` que o runner embute em CI. Roteamento completo: [`AGENTS.md`](../AGENTS.md#skills--roteamento-e-gestão).

| Skill | Invocação | Quando usar |
| :--- | :--- | :--- |
| `code-review-self` | `/code-review-self` | Dry-run local espelhando `src/index.ts` sem `@cursor/sdk` |
| `megabrain` | `/megabrain` | Revisão iterativa com `[Thread #N]` |
| `solve-pr` | `/solve-pr` | Corrigir threads abertas no GitHub e republicar |

Prompts de runtime (`skills/SYSTEM_PROMPT.md`, `skills/CODE_REVIEW.md`, `skills/stacks/`) são carregados automaticamente pelo runner — não requerem invocação manual.

---

## 🌐 Integração em CI/CD

### 1. Azure Pipelines (Azure DevOps)

Utilize o template pronto do projeto: [`azure-pipelines-cursor-code-review.yml`](azure-pipelines-cursor-code-review.yml). 

1. Copie o arquivo para a raiz do seu repositório Git alvo.
2. Certifique-se de criar um **Variable Group** (ex: `vg-agentic-code-reviewers`) no Azure DevOps contendo a variável secreta `CURSOR_API_KEY`.
3. Garanta que o **Build Service** da sua pipeline tenha permissão de **Contribute to pull requests** nas configurações do repositório.
4. Habilite a opção **Allow scripts to access the OAuth token** nas configurações de execução do job da pipeline.
5. Configure uma branch policy de **Build Validation** apontando para esta pipeline.

### 2. GitHub Actions

#### Neste repositório

| Workflow | Gatilho | Função |
| :--- | :--- | :--- |
| [`.github/workflows/code-review.yml`](.github/workflows/code-review.yml) | PR → **`main`**; `workflow_dispatch` | Review deste repo via `run.sh --local` (matrix por engine) |
| [`.github/workflows/auto-fix.yml`](.github/workflows/auto-fix.yml) | `workflow_run` após code review; `workflow_dispatch` | Auto-fix sequencial (cursor-sdk → opencode) após review bem-sucedido |
| [`.github/workflows/review-remote.yml`](.github/workflows/review-remote.yml) | `workflow_call` | Reusable workflow para **outros repositórios** (modo remoto) |
| [`.github/workflows/release.yml`](.github/workflows/release.yml) | Push/merge → **`main`** | Testes, build de todas as engines, bump e deploy na branch `release` |

##### Política de merge (`main`)

O ruleset [`agentic-main`](.github/rulesets/agentic-main.json) (Settings → Rules) exige:

- Alterações em **`main`** somente via PR (sem push direto)
- **Todas as threads de review resolvidas** antes do merge (`required_review_thread_resolution`)
- Sem force-push ou exclusão da branch default

Fonte versionada em [`.github/rulesets/`](.github/rulesets/). Aplicar após editar:

```bash
bash scripts/apply-rulesets.sh
```

Os checks de code review (`continue-on-error: true`) **não** bloqueiam o merge por si só — apenas threads abertas na PR impedem o merge.

##### Code review (`code-review.yml`)

Dispara **somente** em PRs com destino **`main`**. Um check por engine via matrix — por padrão **em paralelo**:

| Check na PR | Engine | Modelo | Tag nos comentários |
| :--- | :--- | :--- | :--- |
| **Review (cursor-sdk)** | `@cursor/sdk` | `composer-2.5` | `Agentic Code Reviewer cursor-sdk` |
| **Review (opencode)** | `@opencode-ai/sdk` | `opencode-go/deepseek-v4-flash` | `Agentic Code Reviewer opencode` |

**Modo de execução**

| Gatilho | Comportamento |
| :--- | :--- |
| `pull_request` | Paralelo por padrão |
| `workflow_dispatch` | Input `execution_mode`: **parallel** ou **sequential** (+ PR/branchs obrigatórios) |
| Variável de repositório `AGENTIC_CODE_REVIEWERS_EXECUTION_MODE` | Sobrescreve o default em PRs (`parallel` ou `sequential`). **Workflow only** — não passa por `env.ts`. |

Em modo **sequential**, a matrix usa `max-parallel: 1`: as engines rodam uma após a outra no mesmo workflow (ordem da matrix: `cursor-sdk` → `opencode`).

Cada job executa `bash run.sh --local --gh ...` no checkout da PR. Neste repositório, `AGENTIC_CODE_REVIEWERS_SCORE_MIN: '1'` no workflow permite publicar threads de validação do runner em CI self-review (consumidores mantêm default **6** se omitirem a variável).

Cada job tem `concurrency` próprio (`review-<engine>-#N`), então re-runs de uma engine não cancelam a outra. Todos usam `continue-on-error: true` (falhas do agente não bloqueiam o merge por padrão).

##### Auto-Fix (`auto-fix.yml`)

Dispara após conclusão bem-sucedida do workflow **Agentic Code Review** (inclui re-runs manuais via `workflow_dispatch`). Um único job executa **sequencialmente** cursor-sdk e opencode (`--auto-fix`), com `git reset --hard` entre engines, `concurrency` por PR e step final que falha se **todos** os engines configurados falharem. Ver [`docs/auto-fix.md`](docs/auto-fix.md).

Para adicionar uma nova engine ao CI, inclua uma entrada em `strategy.matrix.include` no workflow (modelo, bot tag e steps condicionais de setup).

##### Resolução automática de threads (GitHub)

Quando o agente confirma correções, o runner posta uma reply com `<!-- resolution-reply -->` e chama a mutação GraphQL `resolveReviewThread` para fechar a thread na PR.

O `GITHUB_TOKEN` padrão do Actions (`github.token`) tem `pull-requests: write` e **publica** comentários, mas a GitHub API **rejeita** `resolveReviewThread` para tokens de integração — erro típico: `Resource not accessible by integration`. O runner trata isso como aviso (a pipeline não falha), porém a thread permanece aberta na UI.

**Recomendado:** crie um secret `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` com um PAT (classic `repo` ou fine-grained **Pull requests: Read and write**). Os workflows [`code-review.yml`](.github/workflows/code-review.yml) e [`review-remote.yml`](.github/workflows/review-remote.yml) já preferem esse secret quando presente:

```yaml
AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN: ${{ secrets.AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN || github.token }}
```

Sem o PAT, resolva threads manualmente na PR ou use a skill [`solve-pr`](.agents/skills/solve-pr/SKILL.md) localmente com um token que tenha escopo de escrita. O ruleset [`agentic-main`](.github/rulesets/agentic-main.json) bloqueia merge em **`main`** enquanto houver threads de review abertas.

##### Release e deploy (`release.yml`)

Após merge em **`main`**, o workflow de release:

1. Roda `npm test`
2. Compila TypeScript (`npm run build`) — **todas** as engines (`cursor-sdk`, `opencode`, …)
3. Valida artefatos em `dist/engine/`
4. Incrementa versão patch em `main` (`[skip ci]` evita loop)
5. Publica artefatos de runtime na branch **`release`** (consumida pelo `run.sh`)

**Secrets obrigatórios** (Settings → Secrets and variables → Actions):

| Secret | Job |
| :--- | :--- |
| `CURSOR_API_KEY` | Job `cursor-sdk` |
| `OPENCODE_API_KEY` | Job `opencode` |

**Secret opcional (recomendado para GitHub):**

| Secret | Uso |
| :--- | :--- |
| `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` | PAT para `resolveReviewThread` quando o agente marca `resolvedThreads`. Sem ele, `github.token` continua publicando reviews, mas threads podem ficar abertas. Ver [Resolução de threads](#resolução-automática-de-threads-github). |

#### Em repositórios consumidores

**Opção A — reusable workflow** (recomendado). Copie [`examples/consumer-github-workflow.yml`](examples/consumer-github-workflow.yml) para `.github/workflows/code-review.yml`:

```yaml
name: Agentic Code Review

on:
  pull_request:
    branches: [main]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    uses: jpolvora/agentic-code-reviewers/.github/workflows/review-remote.yml@release
    with:
      score_min: '6'   # opcional; omitir = default 6
    secrets:
      CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
      # opcional — resolve threads fechadas pelo agente (resolvedThreads):
      AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN: ${{ secrets.AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN }}
```

Com **OpenCode**, passe também `with: { engine: opencode, model: opencode-go/deepseek-v4-flash }` e o secret `OPENCODE_API_KEY`. O reusable workflow usa `secrets.AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN || github.token` internamente.

**Opção B — `curl` + `run.sh`** (sem reusable workflow):

Exemplo usando **Cursor SDK**:

```yaml
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - name: Run remote reviewer (Cursor SDK)
        env:
          CURSOR_API_KEY: ${{ secrets.CURSOR_API_KEY }}
          AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN: ${{ secrets.AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN || github.token }}
        run: |
          curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/release/run.sh | bash -s -- \
            --engine cursor-sdk --model composer-2.5 \
            --gh \
            --pr-id "${{ github.event.pull_request.number }}" \
            --source-branch "${{ github.head_ref }}" \
            --target-branch "${{ github.event.pull_request.base.ref }}"
```

Exemplo alternativo usando **OpenCode**:

```yaml
      - name: Run remote reviewer (OpenCode)
        env:
          OPENCODE_API_KEY: ${{ secrets.OPENCODE_API_KEY }}
          AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN: ${{ secrets.AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN || github.token }}
        run: |
          curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/release/run.sh | bash -s -- \
            --engine opencode --model opencode-go/deepseek-v4-flash \
            --gh \
            --pr-id "${{ github.event.pull_request.number }}" \
            --source-branch "${{ github.head_ref }}" \
            --target-branch "${{ github.event.pull_request.base.ref }}"
```

> Use a branch **`release`** no URL do `run.sh` (artefatos compilados alinhados ao script). A branch `main` contém código-fonte TypeScript.

---

## 📦 Runner (`run.sh`)

O script [`run.sh`](run.sh) executa o reviewer no **diretório atual** (repositório alvo). Dois modos:

| Modo | Quando | Comportamento |
| :--- | :--- | :--- |
| **Remoto** (padrão) | Outros projetos, `curl \| bash` | Clona branch `release` → `npm ci --omit=dev` → `node dist/index.js --repo-root $PWD` |
| **Local** (`--local`) | CI deste repo, dev na raiz | Usa checkout atual → `npx tsx src/index.ts` (sem clone) |

```bash
# Este repositório (CI / dev)
bash run.sh --local --gh --pr-id 42 --source-branch feat/x --target-branch main

# Outro repositório (após checkout do projeto alvo)
curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/release/run.sh | bash -s -- \
  --gh --pr-id 42 --source-branch feat/x --target-branch main
```

**Opções do runner**

| Flag / env | Descrição |
| :--- | :--- |
| `--local` / `AGENTIC_CODE_REVIEWERS_LOCAL=1` | Modo local (sem clone `release`) |
| `--engine`, `-e` / `AGENTIC_CODE_REVIEWERS_ENGINE` | `cursor-sdk` (default) ou `opencode` |
| `AGENTIC_CODE_REVIEWERS_REPO_URL` | URL git do reviewer (modo remoto; só `run.sh`) |
| `AGENTIC_CODE_REVIEWERS_RELEASE_BRANCH` | Branch dos artefatos (default: `release`; só `run.sh`) |
| `AGENTIC_CODE_REVIEWERS_USE_TSX=true` | Força `npx tsx src/index.ts` em `--local` |
| `OPENCODE_API_KEY` | Credencial OpenCode Go; `run.sh` instala CLI, exporta PATH e grava `auth.json` |

Demais argumentos (`--dry-run`, `--stack`, `--gh`, `--pr-id`, …) são repassados ao `src/index.js` / `dist/index.js`.

```bash
# Dry-run remoto com OpenCode
export CURSOR_API_KEY="..."
export AGENTIC_CODE_REVIEWERS_ENGINE=opencode
export AGENTIC_CODE_REVIEWERS_MODEL=opencode-go/deepseek-v4-flash
curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/release/run.sh | bash -s -- --dry-run
```

#### 2. Dry-run com OpenCode Go (servidor embutido — padrão)

Requer CLI [OpenCode](https://opencode.ai/) no `PATH` e credenciais em `~/.local/share/opencode/auth.json` (`opencode providers`), ou `OPENCODE_API_KEY` para o `run.sh` configurar automaticamente.

```bash
export AGENTIC_CODE_REVIEWERS_ENGINE=opencode
export AGENTIC_CODE_REVIEWERS_MODEL=opencode-go/deepseek-v4-flash
npm run review:local
# ou: bash run.sh --local --engine opencode --dry-run
```

Para reutilizar um `opencode serve` já em execução, defina também `AGENTIC_CODE_REVIEWERS_OPENCODE_URL=http://127.0.0.1:43147`.

#### 3. Diff local vs `develop` + uncommitted
```bash
export CURSOR_API_KEY="sua_chave_aqui"
curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/release/run.sh | bash -s -- --dry-run --target-branch refs/heads/develop --include-uncommitted
```

#### 4. GitHub Actions (consumidor — reusable workflow)
Ver [`examples/consumer-github-workflow.yml`](examples/consumer-github-workflow.yml) e [`.github/workflows/review-remote.yml`](.github/workflows/review-remote.yml).

#### 5. Azure Pipelines (consumidor via cURL)

Exemplo usando **Cursor SDK**:
```yaml
- script: |
    curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/release/run.sh | bash -s -- \
      --engine cursor-sdk --model composer-2.5 \
      --ado --org "MinhaOrg" --project "MeuProjeto" --repo "MeuRepo" \
      --pr-id $(System.PullRequest.PullRequestId)
  env:
    CURSOR_API_KEY: $(CURSOR_API_KEY)
    SYSTEM_ACCESSTOKEN: $(System.AccessToken)
  displayName: 'Agentic Review (Cursor SDK)'
```

Exemplo alternativo usando **OpenCode**:
```yaml
- script: |
    curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/release/run.sh | bash -s -- \
      --engine opencode --model opencode-go/deepseek-v4-flash \
      --ado --org "MinhaOrg" --project "MeuProjeto" --repo "MeuRepo" \
      --pr-id $(System.PullRequest.PullRequestId)
  env:
    OPENCODE_API_KEY: $(OPENCODE_API_KEY)
    SYSTEM_ACCESSTOKEN: $(System.AccessToken)
  displayName: 'Agentic Review (OpenCode)'
```

> [!IMPORTANT]
> Com `opencode`, credenciais LLM ficam no servidor (`auth.json` ou `OPENCODE_API_KEY`); o runner sobe o servidor embutido por padrão. Com `cursor-sdk`, configure `CURSOR_API_KEY`.

---

## 🧑‍💻 Execução e Testes Locais

### Pré-requisitos

*   Node.js **22.13+**
*   **Engine `cursor-sdk`:** `CURSOR_API_KEY` no `.env` — use `AGENTIC_CODE_REVIEWERS_MODEL=composer-2.5` (ou passe `--model`).
*   **Engine `opencode`:** CLI [OpenCode](https://opencode.ai/) no PATH; servidor embutido por padrão. `OPENCODE_API_KEY` em CI. `CURSOR_API_KEY` **não** é exigida.

```bash
# cursor-sdk
npm run review -- --dry-run --engine cursor-sdk --model composer-2.5

# opencode
npm run review -- --dry-run --engine opencode --model opencode-go/deepseek-v4-flash
```

### Comandos Úteis

| Comando | Descrição |
| :--- | :--- |
| `npm install` | Instala todas as dependências locais. |
| `npm run review:local` | Roda uma simulação (`--dry-run`) contra o diff da branch local. |
| `npm test` | Executa validações de tipo (`tsc --noEmit`) e a suite de testes unitários. |
| `npm run test:seed` | Roda o teste E2E: instala fixtures temporárias de defeito, executa a análise com agente em modo dry-run/seed e valida se todos os cenários de `SEED-ISSUES.md` foram detectados pelo agente. |
| `npm run build` | Compila o projeto TypeScript para JavaScript na pasta `dist/`. |

---

## 🗂️ Estrutura de Diretórios

*   `src/index.ts` : Orquestrador principal do fluxo de revisão.
*   `src/config.ts` : Tratamento de argumentos da CLI e resolução de parâmetros de ambiente.
*   `src/provider/` : Abstrações e integrações de APIs de plataformas (`github.ts` e `azuredevops.ts`).
*   `src/engine/` : `ExecutionEngine`, `getEngine()` e adapters `cursor-sdk` (`@cursor/sdk`) e `opencode` (`@opencode-ai/sdk`).
*   `src/agent/` : Montagem do prompt (`prompt.ts`) e orquestração da chamada ao engine (`runner.ts`).
*   `src/ado/` : Gate (`review-validation.ts`, `safe-outputs.ts`), rodadas, formatação de threads e helpers ADO.
*   `src/orchestrator/` : Paralelismo in-process (`parallel-runner.ts`), merge (`merge-reviews.ts`), meta-reviewer e **auto-fix** (`autofix-runner.ts` — inclui sumário detalhado pós-push).
*   `src/git/autofix-commit.ts` : Commit consolidado (`fix(#N): auto-fix issues from review threads [...]`) e push após auto-fix.
*   `skills/` : Contratos de prompts estáticos (`SYSTEM_PROMPT.md`, `CODE_REVIEW.md`, `AUTO_FIX.md`) e subpasta `skills/stacks/` com recomendações por stack.
*   `.agents/skills/` : Skills agênticas do ecossistema do runner (`code-review-self`, `megabrain`, `solve-pr` e scripts auxiliares).
*   `.github/workflows/auto-fix.yml` : Pipeline de auto-fix (self-healing) acionada após code review.
*   `run.sh` : Runner portátil (modo remoto via branch `release` ou `--local` para CI/dev).
*   `examples/consumer-github-workflow.yml` : Template de workflow para repositórios consumidores.
*   `.github/workflows/review-remote.yml` : Reusable workflow GitHub Actions para consumidores.

---

## 🤝 Contribuir

O **agentic-code-reviewers** foi desenhado para crescer por extensão, não por fork silencioso:

1. **Fork** o repositório.
2. **Escolha o ponto de extensão:** engine agêntica (`ExecutionEngine`), provedor de plataforma (`PlatformProvider`) ou stack (`STACKS` + `skills/stacks/`).
3. **Implemente** seguindo os contratos em `src/engine/types.ts` e `src/provider/types.ts`.
4. **Valide** com `npm test` e `npm run test:seed`.
5. **Atualize documentação** — `README.md`, `AGENTS.md`, `docs/` e `.env.example` em sync com o código (ver [`AGENTS.md`](AGENTS.md) § Definition of Done).
6. **Abra PR** com documentação das variáveis de ambiente e exemplos de uso.

Novas engines (outros SDKs agênticos, harness locais, modelos self-hosted) e providers (GitLab, Bitbucket, Gitea, …) são encorajadas. O pipeline central (diff, gate, rodadas, publicação) permanece estável enquanto você pluga sua camada de execução.
