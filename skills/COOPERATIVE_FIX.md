# Contrato Cooperativo de Correção (Auto-Fix ↔ solve-pr)

Documento **normativo compartilhado** entre:

| Runtime | Onde vive | Modo |
|---------|-----------|------|
| **Auto-Fix CI** | `skills/AUTO_FIX.md` + `src/orchestrator/autofix-runner.ts` | `--auto-fix` / `auto-fix.yml` |
| **solve-pr IDE** | `.agents/skills/solve-pr/SKILL.md` | Invocação manual `/solve-pr` |

Os runtimes são **independentes** (sem import ou acoplamento de código). Este contrato alinha **gates**, **formato de resposta** e **ordem de operações** para leitura cruzada nas threads da PR.

---

## Princípios (Karpathy + AGENTS.md)

1. **Think before coding** — entenda causa raiz antes de editar.
2. **Simplicity first** — mínimo código que resolve; sem refatoração adjacente.
3. **Surgical changes** — só linhas rastreáveis à issue da thread.
4. **Tests when material** — rode `npm test` (ou equivalente da stack) antes de commit quando a correção tocar lógica executável.

---

## Escopo de threads

| Runtime | Escopo |
|---------|--------|
| **Auto-Fix CI** | **Todas** as review threads abertas com arquivo+linha. Analisa a descrição integral de cada uma. |
| **solve-pr IDE** | **Todas** as review threads abertas na PR |

Não fechar thread sem correção correspondente listada explicitamente (`resolvedThreads` no Auto-Fix).

---

## Ordem de operações (Auto-Fix CI)

```
1. Buscar threads abertas (arquivo+linha)
2. Analisar profundamente cada descrição
3. Aplicar correções cirúrgicas
4. git add + commit local
5. Executar build de validação (`npm test` / `npm run build` ou `AGENTIC_CODE_REVIEWERS_AUTO_FIX_BUILD_COMMAND`; falha = exit ≠ 0)
6. Fechar cada thread corrigida com comentário detalhado (causa raiz + o que mudou)
7. git push — somente se build e resoluções tentadas tiverem sucesso
```

Se o passo 5 ou 6 falhar: **não fazer push**. Commit local preservado para inspeção manual.

**Dual-engine sequencial (CI):** se o engine anterior resolveu threads mas o push falhou, o engine seguinte tenta **recovery push** do commit local pendente.

---

## Resposta na thread

Toda resolução inclui o marcador canônico:

```
<!-- resolution-reply -->
```

Corpo: **explicação detalhada** do agente (problema, causa raiz, alteração, por que resolve). Auto-Fix prefixa com `botTag` na API.

---

## Formato estruturado (Auto-Fix subagente)

JSON (`AUTO_FIX.md`):

- `replacements[]` — intervalos alterados no arquivo.
- `resolvedThreads[]` — `{ threadId, explanation }` por thread fechada.

---

## Contexto intra-review

| Campo | Uso |
|-------|-----|
| `threadId` | Resolução na API |
| `filePath` | Arquivo ancorado |
| `lineNumber` | Linha da review |
| `description` | Texto integral do comentário (análise profunda) |
| `summary` | Resumo curto para tabelas do reviewer |

---

## Token GitHub

`AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` → `GITHUB_TOKEN` → `GH_TOKEN`

PAT recomendado para `resolveReviewThread`.
