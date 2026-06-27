# Agentic Code Reviewers — Referência para Agentes

Guia operacional para agentes de IA neste repositório (**Multi Agent Code Reviewer** — plugável, extensível, multi-stack, multi-plataforma). Dois perfis de uso:
- **Agente Analisador** — invocado pelo runner para revisar uma PR.
- **Agente Desenvolvedor** — modifica ou estende o próprio runner.

---

## Comportamento Invariável

- **Não implemente o que não foi pedido expressamente.** Ante qualquer ambiguidade ou bifurcação de design, pare e pergunte.
- **Seja crítico, não complacente.** Questione premissas; recuse sugestões sem sentido arquitetural com justificativa técnica.
- **Simplicity first.** Mudanças mínimas, sem workarounds, sem over-engineering.

---

## 1. Agente Analisador

### Modo de operação
- Estritamente **somente leitura**. Proibido: commits, push, alteração de arquivos no repositório alvo, formatters/linters.
- Permitido: `read_file`, `grep_search`, `glob`, busca semântica, inspeção de diff.
- O sandbox (`local.sandboxOptions.enabled` em `src/engine/cursor-sdk/stream.ts`) reforça esse contrato no nível do SDK.

### Análise em duas fases

**Fase 1 — Triagem:** examine o diff. Identifique candidatos com falhas reais (segurança, concorrência, vazamento de recursos, bugs lógicos). Descarte imediatamente: nits, estilo, preferências e alertas conceituais sem caminho executável de falha.

**Fase 2 — Investigação:** para cada candidato, use `read_file` e `grep_search` para ler o arquivo completo, testes, chamadores e middlewares relacionados. Um achado só é válido se você conseguir preencher as quatro etapas abaixo no campo `analysis`:
1. **Evidência** — arquivos e símbolos lidos.
2. **Cenário** — como a falha ocorre na prática.
3. **Proteção ausente** — por que validações/testes atuais não bloqueiam a falha.
4. **Descartes** — hipóteses alternativas testadas e rejeitadas.

Se não conseguir preencher as quatro etapas, descarte o achado.

### Consulta ao harness do projeto alvo
Antes de revisar, consulte no `repoRoot` (nesta ordem, se existirem):
1. `AGENTS.md` do projeto.
2. `.cursor/rules/main.mdc` ou as regras pré-mapeadas no prompt.
3. `.agents/skills/code-review/SKILL.md`.
4. `docs/` — regras de domínio e arquitetura.

### Contrato de saída JSON
Responda **exclusivamente** com um bloco JSON contendo:

```json
{
  "reviews": [
    {
      "fileName": "/src/MinhaClasse.cs",
      "lineNumber": 15,
      "severity": "critical",
      "comment": "Descrição curta da falha (sem blocos de código).",
      "score": 9,
      "developerAction": "fix-code",
      "analysis": "1. Evidência: ... 2. Cenário: ... 3. Proteção: ... 4. Descarte: ...",
      "impactPaths": ["/src/MinhaClasse.cs", "/src/Middlewares/Auth.cs"],
      "suggestedFix": "```csharp\n// correção cirúrgica\n```"
    }
  ],
  "resolvedThreads": [
    { "threadId": 12345, "note": "Corrigido na linha 15." }
  ],
  "reviewSummary": ""
}
```

### Regras do gate (`src/ado/review-validation.ts`)
Achados que violarem qualquer regra abaixo são descartados automaticamente:

| Campo | Regra |
|---|---|
| `score` | Inteiro entre **AGENTIC_CODE_REVIEWERS_SCORE_MIN–10** (default `6`). Score abaixo do mínimo é descartado. Omitir env / `--score-min` preserva o limiar 6. |
| `fileName` + `lineNumber` | Devem apontar para linhas alteradas no diff (lineNumber > 0). |
| `severity` | `critical` (score 9–10) · `warning` (6–8) · `suggestion` (6–7) |
| `developerAction` | `fix-code` ou `escalate`. Nunca `resolve-comment` em reviews novos. |
| `suggestedFix` | Opcional. Em Azure DevOps, não use a cerca ` ```suggestion `. Em GitHub, pode usar para habilitar o botão de aplicação automática. |
| `analysis` | Obrigatório com as 4 etapas da prova estruturada. |
| `impactPaths` | Array com ao menos um arquivo lido que sustente a investigação. |

### Rodadas e escalonamento
O runner rastreia iterações pelo marcador `<!-- reviewer-round-state -->`. Ao exceder `AGENTIC_CODE_REVIEWERS_MAX_ROUNDS` (padrão: 5):
- Suprima achados `warning` e `suggestion`.
- Publique apenas `critical` (segurança ou quebra de invariantes de negócio).
- O runner adicionará aviso de handoff para revisão humana na PR.

O runner se autoexclui do diff por padrão (evita loops). Defina `AGENTIC_CODE_REVIEWERS_REVIEW_SELF=true` para revisar o próprio codebase — inclui a pasta do runner no diff e mescla `**/*.yml`, `**/*.yaml`, `**/*.sh` aos includes da stack (salvo `INCLUDE_PATTERNS` explícito).

### Variáveis de ambiente

Todas as variáveis do projeto usam o prefixo **`AGENTIC_CODE_REVIEWERS_`**. Leitura centralizada em `src/env.ts` (`readEnv`, `ENV`, `env.*`). Nomes legados (`CURSOR_REVIEWER_*`, `CURSOR_API_KEY`, `SCORE_MIN`, etc.) funcionam como fallback — **não** use nomes legados em docs ou exemplos novos.

| Variável | Default | Uso |
|---|---|---|
| `AGENTIC_CODE_REVIEWERS_CURSOR_API_KEY` | — | Obrigatória no bootstrap (mesmo com `opencode`) |
| `AGENTIC_CODE_REVIEWERS_ENGINE` | `cursor-sdk` | `cursor-sdk` \| `opencode` |
| `AGENTIC_CODE_REVIEWERS_MODEL` | por engine | ID Cursor ou `provider/model` |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_URL` | — | Servidor OpenCode externo (opcional). **Vazio = embutido (padrão).** |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_HOSTNAME` | `127.0.0.1` | Host do servidor embutido |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_PORT` | `4096` | Porta do servidor embutido |
| `AGENTIC_CODE_REVIEWERS_OPENCODE_AGENT` | `explore` | Agente OpenCode (read-only) |
| `AGENTIC_CODE_REVIEWERS_SCORE_MIN` | `6` | Limiar de publicação de threads |
| `AGENTIC_CODE_REVIEWERS_MAX_ROUNDS` | `5` | Escalonamento (`0` desativa) |
| `AGENTIC_CODE_REVIEWERS_STACK` | autodetect | Stack ou `Custom` |
| `AGENTIC_CODE_REVIEWERS_REPO_ROOT` | auto | Raiz do repo alvo |

Lista completa: [`.env.example`](.env.example), [`README.md`](README.md), [`docs/index.md`](docs/index.md).

**Precedência:** flags CLI (`--engine`, `--model`, `--score-min`) > env canônica > env legada > default.

---

## 2. Agente Desenvolvedor

### Arquitetura

| Arquivo/Pasta | Responsabilidade |
|---|---|
| `src/index.ts` | Ponto de entrada: prepara workspace, coleta contexto de PR, dispara agente, posta comentários. |
| `src/config.ts` | Argumentos CLI e variáveis de ambiente. |
| `src/env.ts` | Prefixo `AGENTIC_CODE_REVIEWERS_*`, leitores `env.*` e fallback legado. |
| `src/engine/` | Interface `ExecutionEngine` + factory `getEngine()`. Engines: `cursor-sdk` (default), `opencode` (`@opencode-ai/sdk`); extensível via PR. |
| `src/engine/cursor-sdk/stream.ts` | **Acoplamento ao `@cursor/sdk`.** Streaming, timeout, sandbox, token usage. |
| `src/agent/runner.ts` | Constrói o prompt e delega ao `ExecutionEngine` injetado. |
| `src/provider/` | Interface `PlatformProvider` + implementações `AdoProvider` e `GithubProvider`. |
| `src/ado/` | Gate (`gate.ts`), validação (`review-validation.ts`), formatação (`format-thread.ts`), rodadas (`round-state.ts`). |
| `skills/stacks/` | Recomendações por stack em Markdown (carregadas pelo runner). |
| `skills/SYSTEM_PROMPT.md` | Contrato JSON, score, severity, política de publicação. |
| `skills/CODE_REVIEW.md` | Harness genérico de code review (injetado no prompt). |
| `.agents/skills/` | Skills agênticas para o **Cursor/IDE** (fora do `@cursor/sdk`). |

### Skills — roteamento e gestão

O repositório tem **duas camadas** de “skills”. Não confundir:

| Camada | Local | Quem carrega | Quando |
|---|---|---|---|
| **Prompts de runtime** | `skills/` | `buildAgentPrompt()` em `src/agent/prompt.ts` | Toda execução via `npm run review`, CI ou `run.sh` |
| **Skills IDE** | `.agents/skills/<nome>/SKILL.md` | Agente do Cursor quando o usuário invoca `/nome` | Desenvolvimento local, dry-run manual, ciclo fix/review |

#### Prompts de runtime (`skills/`)

Montagem do prompt (ordem em `buildAgentPrompt`):

1. `skills/SYSTEM_PROMPT.md` — contrato JSON, tabelas score × severity, política ADO/GitHub.
2. `skills/CODE_REVIEW.md` — harness genérico do projeto.
3. `skills/stacks/<stack>.md` — recomendações da stack (`AGENTIC_CODE_REVIEWERS_STACK` / `--stack`).
4. Contexto dinâmico — diff, rules `.cursor/rules/*.mdc`, PR, work items, threads existentes.
5. Workflow em duas fases — instruções Fase 1/2/3; injeta `AGENTIC_CODE_REVIEWERS_SCORE_MIN` no filtro.

O agente em CI **não** lê `.agents/skills/` automaticamente — só o que o runner embute no prompt. Referência cruzada no prompt: skill genérica de code-review do **projeto alvo** em `.agents/skills/code-review/SKILL.md` (se existir no `repoRoot`).

#### Skills IDE (`.agents/skills/`)

| Skill | Invocação | Modo | Pipeline espelhado |
|---|---|---|---|
| [`code-review-self`](.agents/skills/code-review-self/SKILL.md) | `/code-review-self` | Somente leitura | `src/index.ts` — triagem, gate, rodadas, JSON idêntico |
| [`megabrain`](.agents/skills/megabrain/SKILL.md) | `/megabrain` | Somente leitura | Revisão iterativa com `[Thread #N]`; avalia `RESOLVED`/`UNRESOLVED` |
| [`solve-pr`](.agents/skills/solve-pr/SKILL.md) | `/solve-pr` | Leitura + escrita | Busca threads GitHub → fix → commit/push → nova rodada CI |

**Roteamento — qual usar?**

```
PR em CI (ADO/GitHub)     → runner automático (npm run review / workflow)
Dry-run local sem SDK     → code-review-self
Follow-up após correções  → megabrain (threads humanas) ou runner (threads do bot)
Corrigir threads do bot   → solve-pr (GitHub) ou dev manual
```

| Cenário | Skill / caminho |
|---|---|
| Validar gate e prompt antes de merge | `code-review-self` + `npm test` |
| Revisão conversacional com IDs estáveis | `megabrain` |
| Bot publicou threads; quero auto-fix | `solve-pr` (`AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` ou legado `GITHUB_TOKEN`) |
| Produção / pipeline | Nenhuma skill IDE — só runner + `skills/` |

#### Adicionar ou alterar skill IDE

1. Crie `.agents/skills/<nome>/SKILL.md` com frontmatter `name` + `description` (trigger do Cursor).
2. Documente modo (read-only vs write), pré-requisitos de env e fluxo passo a passo.
3. Scripts auxiliares em `.agents/skills/<nome>/scripts/` (ex.: `solve-pr`).
4. Atualize **este** `AGENTS.md`, [`README.md`](README.md) e tabela em [`docs/index.md`](docs/index.md).
5. Skills genéricas reutilizáveis entre projetos → [workflow-skills](https://github.com/jpolvora/workflow-skills).

#### Adicionar stack de runtime

1. Registre em `STACKS` + `getStackConfig` (`src/config.ts`).
2. Crie `skills/stacks/<nome>.md`.
3. Cubra autodetecção em `test/config.test.ts`.
4. Sincronize `README.md` e `docs/`.

### Comandos de validação (obrigatórios antes de finalizar)

```bash
npm test                  # typecheck + testes unitários
npm run test:seed         # E2E: instala fixtures, roda dry-run, valida detecção dos defeitos em SEED-ISSUES.md
npm run seed:verify-clean # garante que fixtures foram desinstaladas e workspace está limpo
```

### Boas práticas

- **Provedores:** toda nova feature deve funcionar em Azure DevOps **e** GitHub. Markdown, GraphQL/REST e sugestões interativas diferem entre plataformas.
- **Stacks:** ao adicionar/modificar stacks, mantenha compatibilidade com o fallback `ABP/Angular` e cubra a autodetecção em `test/config.test.ts`.
- **Sincronização de docs:** ao alterar `review-validation.ts`, `round-state.ts`, lógica de diff, stacks, prompts, env vars (`src/env.ts`) ou skills, atualize este `AGENTS.md`, o `README.md` e `docs/` em conjunto.

### Skills locais — referência rápida

Ver seção [Skills — roteamento e gestão](#skills--roteamento-e-gestão) acima. Resumo:

| Skill | Uso |
|---|---|
| `code-review-self` | Review agêntico somente-leitura via IDE, sem `@cursor/sdk`. |
| `megabrain` | Threads numeradas (`[Thread #N]`); follow-up entre commits. |
| `solve-pr` | Threads ativas no GitHub → fix → commit/push → aguarda runner. |

Ao adicionar ou alterar skills, atualize este arquivo, o `README.md` e `docs/index.md`.
