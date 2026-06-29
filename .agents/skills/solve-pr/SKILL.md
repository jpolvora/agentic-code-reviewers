---
name: solve-pr
description: Skill agêntica para buscar threads abertas da PR (GitHub), corrigir issues de code review com gate cooperativo, validar, commit, resolver threads e push — loop code-review → fix → commit → code-review.
---

# Skill `solve-pr` — correção cooperativa de PR (IDE)

Runtime **IDE** complementar ao **Auto-Fix CI** (`--auto-fix` / `auto-fix.yml`). Ambos seguem o contrato compartilhado [`skills/COOPERATIVE_FIX.md`](../../skills/COOPERATIVE_FIX.md) — mesmos gates e formato de resposta, **sem acoplamento de código**.

| | Auto-Fix CI | solve-pr (IDE) |
|---|-------------|----------------|
| Gatilho | `workflow_run` / `--auto-fix` | `/solve-pr` manual |
| Correção | Subagente JSON + replacements | Agente IDE (edição direta) |
| Threads | Bot (`PlatformProvider`) | **Todas** as threads abertas (GraphQL) |
| Push | Após resolução OK | Após resolução OK |

## Loop cooperativo

```
code review → developer fix → commit → resolve threads → push → code review → …
```

`solve-pr` lista **todas** as review threads não resolvidas da PR — bot, humano ou outro reviewer.

---

## Pré-requisitos

- Repositório GitHub; branch da PR checked out.
- Token com escrita: `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` (preferido) ou `GITHUB_TOKEN` / `GH_TOKEN`.

---

## Fluxo (gate cooperativo)

### 1. Recuperar threads abertas

```bash
node .agents/skills/solve-pr/scripts/fetch_threads.cjs <PR_ID>
# JSON para parsing:
node .agents/skills/solve-pr/scripts/fetch_threads.cjs <PR_ID> --json
```

Saída inclui `threadId`, `filePath`, `lineNumber`, `summary` — qualquer thread aberta na PR.

### 2. Investigar e corrigir (paridade com Auto-Fix)

Para **cada thread** listada:

1. Leia arquivo completo + testes/callers relacionados (`read`, `grep`).
2. Aplique correção **cirúrgica** (ver [`skills/AUTO_FIX.md`](../../skills/AUTO_FIX.md) e Karpathy guidelines).
3. **Não** resolva thread sem alteração comprovada na linha ancorada.
4. Opcional: use mentalmente o contrato JSON (`replacements` + `explanation`) mesmo editando direto.

### 3. Validar

```bash
npm test
```

### 4. Commit local (sem push)

```bash
git add <arquivos>
git commit -m "fix(#<PR_ID>): auto-fix issues from review threads [<THREAD_ID1>, <THREAD_ID2>, ...]"
```

### 5. Resolver threads (gate obrigatório)

Para **cada thread corrigida**, reply + resolve com marcador canônico:

```bash
node .agents/skills/solve-pr/scripts/resolve_thread.cjs <THREAD_ID> "Causa raiz e o que foi corrigido."
```

O script inclui `<!-- resolution-reply -->` (paridade com `src/provider/github.ts`).

> **Gate:** se **qualquer** resolução tentada falhar → **não** faça push. Informe o usuário quais `threadId` falharam.

### 6. Push (somente após resoluções OK)

```bash
git push origin HEAD
```

### 7. Aguardar próxima rodada de code review

Se novas threads aparecerem, reinicie do passo 1.

---

## Comportamento cooperativo com code review

- Use o **comentário da thread** como spec da correção (severity, analysis, suggested fix).
- Respostas de resolução usam `<!-- resolution-reply -->` para a próxima rodada reconhecer histórico.
- Não re-levante issues já resolvidas sem nova evidência (mesma política do reviewer).

---

## O que não fazer

- Não push antes de resolver threads tentadas.
- Não refatorar código adjacente à issue.
- Não criar `implementation_plan.md` obrigatório — plano mental ou notas curtas bastam.
