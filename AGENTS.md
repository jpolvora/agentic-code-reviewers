# Cursor Reviewer — Referência para Agentes

Guia operacional para agentes de IA neste repositório. Dois perfis de uso:
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
| `score` | Inteiro entre **SCORE_MIN–10** (default `SCORE_MIN=6`). Score abaixo do mínimo é descartado. Omitir `SCORE_MIN` / `--score-min` preserva o limiar 6. |
| `fileName` + `lineNumber` | Devem apontar para linhas alteradas no diff (lineNumber > 0). |
| `severity` | `critical` (score 9–10) · `warning` (6–8) · `suggestion` (6–7) |
| `developerAction` | `fix-code` ou `escalate`. Nunca `resolve-comment` em reviews novos. |
| `suggestedFix` | Opcional. Em Azure DevOps, não use a cerca ` ```suggestion `. Em GitHub, pode usar para habilitar o botão de aplicação automática. |
| `analysis` | Obrigatório com as 4 etapas da prova estruturada. |
| `impactPaths` | Array com ao menos um arquivo lido que sustente a investigação. |

### Rodadas e escalonamento
O runner rastreia iterações pelo marcador `<!-- reviewer-round-state -->`. Ao exceder `CURSOR_REVIEWER_MAX_ROUNDS` (padrão: 5):
- Suprima achados `warning` e `suggestion`.
- Publique apenas `critical` (segurança ou quebra de invariantes de negócio).
- O runner adicionará aviso de handoff para revisão humana na PR.

O runner se autoexclui do diff por padrão (evita loops). Defina `CURSOR_REVIEWER_REVIEW_SELF=true` para revisar o próprio codebase.

---

## 2. Agente Desenvolvedor

### Arquitetura

| Arquivo/Pasta | Responsabilidade |
|---|---|
| `src/index.ts` | Ponto de entrada: prepara workspace, coleta contexto de PR, dispara agente, posta comentários. |
| `src/config.ts` | Argumentos CLI e variáveis de ambiente. |
| `src/engine/` | Interface `ExecutionEngine` + factory `getEngine()`. Engines: `cursor-sdk` (default), `opencode` (`@opencode-ai/sdk`). |
| `src/engine/cursor-sdk/stream.ts` | **Acoplamento ao `@cursor/sdk`.** Streaming, timeout, sandbox, token usage. |
| `src/agent/runner.ts` | Constrói o prompt e delega ao `ExecutionEngine` injetado. |
| `src/provider/` | Interface `PlatformProvider` + implementações `AdoProvider` e `GithubProvider`. |
| `src/ado/` | Gate (`gate.ts`), validação (`review-validation.ts`), formatação (`format-thread.ts`), rodadas (`round-state.ts`). |
| `skills/stacks/` | Recomendações por stack em Markdown. |

### Comandos de validação (obrigatórios antes de finalizar)

```bash
npm test                  # typecheck + testes unitários
npm run test:seed         # E2E: instala fixtures, roda dry-run, valida detecção dos defeitos em SEED-ISSUES.md
npm run seed:verify-clean # garante que fixtures foram desinstaladas e workspace está limpo
```

### Boas práticas

- **Provedores:** toda nova feature deve funcionar em Azure DevOps **e** GitHub. Markdown, GraphQL/REST e sugestões interativas diferem entre plataformas.
- **Stacks:** ao adicionar/modificar stacks, mantenha compatibilidade com o fallback `ABP/Angular` e cubra a autodetecção em `test/config.test.ts`.
- **Sincronização de docs:** ao alterar `review-validation.ts`, `round-state.ts`, lógica de diff, stacks suportadas ou prompts do sistema, atualize este `AGENTS.md`, o `README.md` e `docs/` em conjunto.

### Skills locais (`.agents/skills/`)

| Skill | Uso |
|---|---|
| `code-review-self` | Review agêntico somente-leitura via IDE/harness, sem acionar o `@cursor/sdk`. |
| `megabrain` | Review iterativo com threads numeradas (`[Thread #N]`); acompanha correções entre rodadas. |
| `solve-pr` | Busca threads ativas no GitHub, implementa correções, faz commit/push e aguarda o runner. |

Ao adicionar ou alterar skills, atualize este arquivo e o `README.md`.

> Para skills genéricas e reutilizáveis entre projetos, consulte [workflow-skills](https://github.com/jpolvora/workflow-skills).
