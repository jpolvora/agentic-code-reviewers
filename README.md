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
*   **⚖️ Garantia de Convergência (Orçamento de Rodadas):** Utiliza um contador de rodadas persistido em um comentário de estado (`<!-- reviewer-round-state -->`). Se as rodadas excederem o limite (default: 5) e continuarem ocorrendo issues abertas, o bot entra em **escalonamento**: publica apenas issues de severidade `critical` (segurança/quebra de negócio) e adiciona um aviso solicitando **revisão humana**.
*   **🔍 Mapeamento Automático de Regras:** Lê e filtra arquivos de regras locais `.cursor/rules/*.mdc` associados aos arquivos alterados no diff antes do início da análise pelo agente.
*   **📊 Relatórios e Visibilidade na Build:** 
    *   **Azure DevOps:** Emite logging commands (`##vso[task.logissue]`) e anexa um resumo markdown rico na tela de build (`##vso[task.uploadsummary]`).
    *   **GitHub:** Anexa um resumo markdown completo da revisão diretamente na página do workflow via `GITHUB_STEP_SUMMARY`.
*   **📦 Execução Remota via cURL:** Permite rodar o reviewer remotamente baixando apenas o script `run.sh` da branch `release`, dispensando o clone completo do repositório ou a presença de dependências de desenvolvimento.
*   **🤖 Skills agênticas do runner (`.agents/skills/`):** Skills versionadas neste repositório para uso no Cursor/IDE ao desenvolver ou operar o **agentic-code-reviewers**:
    *   **`code-review-self`** — Executa o pipeline de review (duas fases, gate, rodadas) pelo próprio agente do IDE, sem `@cursor/sdk`; útil para dry-run local e validação do comportamento do runner.
    *   **`megabrain`** — Revisão com threads persistentes (`[Thread #1]`, `[Thread #2]`, …); em rodadas seguintes avalia se cada thread foi `RESOLVED` ou permanece `UNRESOLVED`.
    *   **`solve-pr`** — Automatiza o ciclo de correção: busca threads do bot no GitHub, aplica fixes, commit/push e aguarda nova rodada do reviewer.

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
AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY=cursor_...
```

Modelos: IDs do Cursor (`composer-2.5`, `claude-sonnet-4-6`, etc.). Validação em `src/engine/cursor-sdk/model.ts`.

### `opencode`

Cliente para servidor [OpenCode](https://opencode.ai/docs/sdk/): sessão → `session.prompt` (com `model: { providerID, modelID }` derivado de `AGENTIC_CODE_REVIEWERS_MODEL`) → resposta do agente. Se o servidor rejeitar o model explícito, o engine repete o prompt usando o default do host. Credenciais ficam no **servidor** (`~/.local/share/opencode/auth.json`), não no `.env` do reviewer.

**Modo padrão — servidor embutido** (recomendado): o runner sobe sua própria instância via `@opencode-ai/sdk` (`createOpencodeServer` → `opencode serve`) e conecta o client automaticamente. Requer CLI `opencode` no `PATH` e porta livre (default `4096`).

```bash
AGENTIC_CODE_REVIEWERS_ENGINE=opencode
AGENTIC_CODE_REVIEWERS_MODEL=opencode-go/deepseek-v4-flash
# opcional: AGENTIC_CODE_REVIEWERS_OPENCODE_HOSTNAME, AGENTIC_CODE_REVIEWERS_OPENCODE_PORT, AGENTIC_CODE_REVIEWERS_OPENCODE_AGENT
```

Não defina `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` (ou deixe vazio). Logs esperados: `OpenCode: iniciando servidor embutido em 127.0.0.1:4096`.

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
> `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY` continua obrigatória no `loadConfig` mesmo com `opencode`; use um valor válido ou placeholder se só rodar via OpenCode local.

---

## 🛠️ Configuração de variáveis de ambiente

Todas as variáveis do projeto usam o prefixo **`AGENTIC_CODE_REVIEWERS_`**. Nomes legados (`CURSOR_REVIEWER_*`, `CURSOR_API_KEY`, `SCORE_MIN`) ainda funcionam como fallback. Detalhes e roteamento de skills: [`AGENTS.md`](AGENTS.md).

Crie um arquivo `.env` na raiz do projeto (veja [.env.example](.env.example)):

```bash
cp .env.example .env
```

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY` | — | Chave do Cursor. Obrigatória no bootstrap. |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | `cursor-sdk` | Engine LLM: `cursor-sdk` ou `opencode`. |
| `AGENTIC_CODE_REVIEWERS_MODEL` | ver abaixo | **`cursor-sdk`:** ID Cursor. **`opencode`:** `provider/model`. |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` | — | URL de servidor OpenCode **externo** (opcional). Omitir = servidor embutido (padrão). |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_HOSTNAME` | `127.0.0.1` | Host do servidor embutido (quando `OPENCODE_URL` vazio). |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_PORT` | `4096` | Porta do servidor embutido (quando `OPENCODE_URL` vazio). |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_AGENT` | `explore` | Agente OpenCode na sessão. |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_GO_API_KEY` | — | Chave OpenCode Go (CI / auth.json). |
| `AGENTIC_CODE_REVIEWERS_AZURE_DEVOPS_PAT` | — | PAT ADO para testes locais. |
| `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` | — | Token GitHub (fallback: `GITHUB_TOKEN` / `GH_TOKEN`). |
| `AGENTIC_CODE_REVIEWERS_TARGET_BRANCH` | `refs/heads/master` | Branch de comparação do diff. |
| `AGENTIC_CODE_REVIEWERS_BOT_TAG` | `[Cursor Reviewer]` | Tag do bot nos comentários. |
| `AGENTIC_CODE_REVIEWERS_MAX_ROUNDS` | `5` | Rodadas antes do handoff humano. |
| `AGENTIC_CODE_REVIEWERS_SCORE_MIN` | `6` | Score mínimo para publicar thread. |
| `AGENTIC_CODE_REVIEWERS_TIMEOUT_MS` | `600000` | Timeout da sessão. |
| `AGENTIC_CODE_REVIEWERS_SANDBOX` | `true` | Sandbox read-only do `cursor-sdk`. |
| `AGENTIC_CODE_REVIEWERS_REPO_ROOT` | auto | Raiz do repositório alvo. |
| `AGENTIC_CODE_REVIEWERS_REVIEW_SELF` | `false` | Incluir o runner no diff; adiciona `*.yml`, `*.yaml`, `*.sh` aos includes da stack. |
| `AGENTIC_CODE_REVIEWERS_STACK` | `ABP/Angular` | Stack ativa ou autodetecção. |
| `AGENTIC_CODE_REVIEWERS_CUSTOM_PROMPT` | — | Prompt quando `stack=Custom`. |
| `AGENTIC_CODE_REVIEWERS_INCLUDE_PATTERNS` | — | Globs de inclusão (CSV). |
| `AGENTIC_CODE_REVIEWERS_REPO_URL` | GitHub | URL clonada pelo `run.sh`. |
| `AGENTIC_CODE_REVIEWERS_EXECUTION_MODE` | `parallel` | CI: `parallel` ou `sequential`. |

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
*   `--score-min <N>` ou `--score-min=<N>` : Score mínimo (inclusive) para publicar issue como thread (default: `6`). Equivalente à variável `AGENTIC_CODE_REVIEWERS_SCORE_MIN`. **Opcional** — pipelines e scripts existentes que não passam este parâmetro continuam com limiar 6.

> Engine também pode ser definida por `AGENTIC_CODE_REVIEWERS_ENGINE` no ambiente; `--engine` tem precedência.

> **Compatibilidade:** `AGENTIC_CODE_REVIEWERS_SCORE_MIN` e `--score-min` são opt-in. Sem configurá-los, o gate permanece **6–10** (mesmo comportamento de versões anteriores). Nomes legados (`SCORE_MIN`, `CURSOR_REVIEWER_*`) ainda funcionam.

---

## 🔄 Fluxo de Execução

```
[PR Aberta/Atualizada]
        │
        ▼
[Preparar Workspace Git] ──► Filtra tipos de arquivos de acordo com a stack (ou --include-patterns)
        │
        ▼
[Coletar Contexto do Provedor] ──► Work Items linkados + Threads de bot existentes
        │
        ▼
[getEngine(config)] ──► cursor-sdk | opencode
        │
        ▼
[Agente de Review (2 Fases)]
   ├─ Fase 1: Triagem ──► Hipóteses sobre linhas alteradas
   └─ Fase 2: Investigação ──► Prova/refuta com tools (read, grep, rules locais)
        │
        ▼
[Gate de Validação] ──► Filtra reviews inválidos ou com score < AGENTIC_CODE_REVIEWERS_SCORE_MIN (default: 6)
        │
        ▼
[Publicação na PR]
   ├─ Azure DevOps: Normaliza cercas e publica threads + Estado da Rodada
   └─ GitHub: Mantém ```suggestion e anexa resumo no GITHUB_STEP_SUMMARY
        │
        ▼
[Fim da Execução] ──► Exit 0 (sucesso/issues encontradas) ou Exit 1 (falhas de sistema)
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
| `solve-pr` | `/solve-pr` | Corrigir threads do bot no GitHub e republicar |

Prompts de runtime (`skills/SYSTEM_PROMPT.md`, `skills/CODE_REVIEW.md`, `skills/stacks/`) são carregados automaticamente pelo runner — não requerem invocação manual.

---

## 🌐 Integração em CI/CD

### 1. Azure Pipelines (Azure DevOps)

Utilize o template pronto do projeto: [`azure-pipelines-cursor-code-review.yml`](azure-pipelines-cursor-code-review.yml). 

1. Copie o arquivo para a raiz do seu repositório Git alvo.
2. Certifique-se de criar um **Variable Group** (ex: `vg-agentic-code-reviewers`) no Azure DevOps contendo a variável secreta `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY`.
3. Garanta que o **Build Service** da sua pipeline tenha permissão de **Contribute to pull requests** nas configurações do repositório.
4. Habilite a opção **Allow scripts to access the OAuth token** nas configurações de execução do job da pipeline.
5. Configure uma branch policy de **Build Validation** apontando para esta pipeline.

### 2. GitHub Actions

#### Neste repositório

| Workflow | Gatilho | Função |
| :--- | :--- | :--- |
| [`.github/workflows/code-review.yml`](.github/workflows/code-review.yml) | PR → **`main`** | Review agêntico (matrix por engine) |
| [`.github/workflows/release.yml`](.github/workflows/release.yml) | Push/merge → **`main`** | Testes, build de todas as engines, bump e deploy na branch `release` |

##### Code review (`code-review.yml`)

Dispara **somente** em PRs com destino **`main`**. Um check por engine via matrix — por padrão **em paralelo**:

| Check na PR | Engine | Modelo | Bot tag |
| :--- | :--- | :--- | :--- |
| **Review (cursor-sdk)** | `@cursor/sdk` | `composer-2.5` | `[Cursor Reviewer]` |
| **Review (opencode)** | `@opencode-ai/sdk` | `opencode-go/deepseek-v4-flash` | `[Cursor Reviewer · OpenCode]` |

**Modo de execução**

| Gatilho | Comportamento |
| :--- | :--- |
| `pull_request` | Paralelo por padrão |
| `workflow_dispatch` | Input `execution_mode`: **parallel** ou **sequential** (+ PR/branchs obrigatórios) |
| Variável `REVIEWER_EXECUTION_MODE` | Sobrescreve o default em PRs (`parallel` ou `sequential`) |

Em modo **sequential**, a matrix usa `max-parallel: 1`: as engines rodam uma após a outra no mesmo workflow (ordem da matrix: `cursor-sdk` → `opencode`).

Cada job tem `concurrency` próprio (`review-<engine>-#N`), então re-runs de uma engine não cancelam a outra. Todos usam `continue-on-error: true` (falhas do agente não bloqueiam o merge por padrão).

Para adicionar uma nova engine ao CI, inclua uma entrada em `strategy.matrix.include` no workflow (modelo, bot tag e steps condicionais de setup).

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
| `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY` | Ambos (validação no bootstrap; legado: `CURSOR_API_KEY`) |
| `GITHUB_TOKEN` | Automático no workflow (`permissions`) |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_GO_API_KEY` | Apenas `review-opencode` (legado: `OPENCODE_GO_API_KEY`) |

O job OpenCode instala o CLI (`curl -fsSL https://opencode.ai/install | bash`), grava `auth.json` no runner e sobe o servidor **embutido** na porta `4096` (sem `opencode serve` manual).

Para desativar o check de referência OpenCode, remova a entrada `opencode` de `strategy.matrix.include` ou comente-a no workflow.

#### Em repositórios consumidores (`run.sh`)

Para revisar **outro** repositório via script remoto (engine `cursor-sdk` apenas):

```yaml
name: Agentic Code Review

on:
  pull_request:
    branches: [ main ]

permissions:
  pull-requests: write
  contents: read

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v6
        with:
          node-version: 22

      - name: Run Reviewer Agent (cursor-sdk)
        env:
          AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY: ${{ secrets.AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY || secrets.CURSOR_API_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          AGENTIC_CODE_REVIEWERS_ENGINE: cursor-sdk
        run: |
          curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/main/run.sh | bash -s -- \
            --gh --pr-id ${{ github.event.pull_request.number }}
```

Para **OpenCode** em repositórios externos, replique o job `review-opencode` de [`.github/workflows/code-review.yml`](.github/workflows/code-review.yml) ou clone o repositório e execute `npx tsx src/index.ts` com as variáveis documentadas em [`.env.example`](.env.example).

---

## 📦 Execução Remota via cURL (`run.sh`)

O script `run.sh` clona a branch **`release`**, instala dependências de runtime e executa o reviewer no **diretório atual** (repositório ou pasta alvo). Aceita seleção de engine antes dos demais argumentos do reviewer.

```bash
curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/main/run.sh | bash -s -- [OPÇÕES]
```

**Seleção de engine**

| Flag | Valores | Default |
| :--- | :--- | :--- |
| `--engine ENGINE` | `cursor`, `cursor-sdk`, `opencode` | `cursor-sdk` |
| `-e ENGINE` | atalho para `--engine` | — |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | env equivalente | `cursor-sdk` |

```bash
# Dry-run com engine padrão (cursor-sdk)
curl -fsSL .../run.sh | bash -s -- --dry-run

# Dry-run com OpenCode (requer CLI opencode + credenciais locais)
curl -fsSL .../run.sh | bash -s -- --engine opencode --dry-run
```

> [!IMPORTANT]
> `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY` é obrigatória no bootstrap. Pipelines com `cursor-sdk` precisam de chave válida; com `opencode`, exporte `AGENTIC_CODE_REVIEWERS_ENGINE` e `AGENTIC_CODE_REVIEWERS_MODEL` (credenciais LLM no servidor OpenCode; por padrão o runner sobe o servidor embutido — não é necessário `OPENCODE_URL` nem `opencode serve` manual).

### 📋 Principais opções de linha de comando (forwarded arguments)

Todos os argumentos passados após `--` são repassados ao indexador do Agentic Code Reviewers. A lista completa de opções suportadas inclui:

| Parâmetro | Descrição |
| :--- | :--- |
| `--engine`, `-e` | Engine: `cursor`, `cursor-sdk` ou `opencode` |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | (env) equivalente a `--engine` |
| `--dry-run` | Executa o review simulado sem publicar threads ou comentários na PR (útil para testes locais). |
| `--verbose` | Exibe logs detalhados de depuração sobre o diff git, tokens e carregamento de regras. |
| `--gh` / `--ado` | Força a plataforma de destino como **GitHub** ou **Azure DevOps**, respectivamente (autodetectado em ambientes CI). |
| `--pr-id <ID>` | ID da Pull Request a ser revisada (obrigatório para publicação de threads). |
| `--stack <nome>` | Define a stack tecnológica para focar a revisão com prompts especializados. Opções: `typescript`, `nextjs/react`, `php/laravel`, `abp/angular` ou `custom`. |
| `--custom-prompt <caminho>` | String de prompt ou caminho para arquivo markdown (obrigatório se `--stack custom` for selecionado). |
| `--target-branch <branch>` | Branch de comparação para gerar o diff (Padrão: `refs/heads/master`). |
| `--include-patterns <csv>` | Lista de padrões glob de inclusão de arquivos separados por vírgula (ex: `**/*.ts,**/*.cs`). |
| `--include-uncommitted` | Inclui arquivos modificados não commitados na análise (staged/unstaged). |
| `--bot-tag <tag>` | Tag identificadora de comentários feita pelo bot (Padrão: `[Cursor Reviewer]`). |
| `--model <id>` | Modelo LLM: ID Cursor (`composer-2.5`) ou `provider/model` no engine `opencode`. |

---

### 💡 Exemplos de uso

#### 1. Dry-run com Cursor SDK (TypeScript)
Analisa o diff local contra a branch `master` usando boas práticas de TypeScript sem publicar nada:
```bash
export AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY="sua_chave_aqui"
curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/main/run.sh | bash -s -- --dry-run --stack typescript
```

#### 2. Dry-run com OpenCode Go (servidor embutido — padrão)

Requer CLI [OpenCode](https://opencode.ai/) no `PATH` e credenciais em `~/.local/share/opencode/auth.json` (`opencode providers`).

```bash
export AGENTIC_CODE_REVIEWERS_ENGINE=opencode
export AGENTIC_CODE_REVIEWERS_MODEL=opencode-go/deepseek-v4-flash
npm run review:local
```

Para reutilizar um `opencode serve` já em execução, defina também `AGENTIC_CODE_REVIEWERS_OPENCODE_URL=http://127.0.0.1:43147`.

#### 3. Diff local vs `develop` + uncommitted
```bash
export AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY="sua_chave_aqui"
curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/main/run.sh | bash -s -- --dry-run --target-branch refs/heads/develop --include-uncommitted
```

#### 4. GitHub Actions (repositório consumidor via cURL)
Para executar remotamente na pipeline do GitHub Actions enviando os dados da PR:
```yaml
- name: Run Reviewer Agent
  env:
    AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY: ${{ secrets.AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY || secrets.CURSOR_API_KEY }}
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/main/run.sh | bash -s -- --gh --pr-id ${{ github.event.pull_request.number }}
```

#### 5. Azure Pipelines
Executa remotamente especificando a organização e projeto:
```yaml
- script: |
    curl -fsSL https://raw.githubusercontent.com/jpolvora/agentic-code-reviewers/main/run.sh | bash -s -- --ado --org "MinhaOrg" --project "MeuProjeto" --repo "MeuRepo" --pr-id $(System.PullRequest.PullRequestId)
  env:
    AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY: $(AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY)
    SYSTEM_ACCESSTOKEN: $(System.AccessToken)
  displayName: 'Executar Agentic Code Reviewers via cURL'
```

---

## 🧑‍💻 Execução e Testes Locais

### Pré-requisitos

*   Node.js **22.13+**
*   **Engine `cursor-sdk`:** `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY` no `.env`
*   **Engine `opencode`:** CLI [OpenCode](https://opencode.ai/) instalado; por padrão o runner sobe o servidor embutido (porta `4096` livre). Opcionalmente aponte `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` para um servidor externo. Credenciais em `~/.local/share/opencode/auth.json`

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
*   `src/agent/` : Montagem do prompt e orquestração da chamada ao engine injetado.
*   `src/ado/` : Regras de validação do gate, de rodadas, formatação de threads e helpers do ADO.
*   `skills/` : Contratos de prompts estáticos do agente (`SYSTEM_PROMPT.md` e `CODE_REVIEW.md`) e subpasta `skills/stacks/` contendo os prompts complementares com as recomendações de cada stack.
*   `.agents/skills/` : Skills agênticas do ecossistema do runner (`code-review-self`, `megabrain`, `solve-pr` e scripts auxiliares).
*   `demo-project/` : Projeto de demonstração contendo erros intencionais para fins de testes locais.

---

## 🤝 Contribuir

O **agentic-code-reviewers** foi desenhado para crescer por extensão, não por fork silencioso:

1. **Fork** o repositório.
2. **Escolha o ponto de extensão:** engine agêntica (`ExecutionEngine`), provedor de plataforma (`PlatformProvider`) ou stack (`STACKS` + `skills/stacks/`).
3. **Implemente** seguindo os contratos em `src/engine/types.ts` e `src/provider/types.ts`.
4. **Valide** com `npm test` e `npm run test:seed`.
5. **Abra PR** com documentação das variáveis de ambiente e exemplos de uso.

Novas engines (outros SDKs agênticos, harness locais, modelos self-hosted) e providers (GitLab, Bitbucket, Gitea, …) são encorajadas. O pipeline central (diff, gate, rodadas, publicação) permanece estável enquanto você pluga sua camada de execução.
