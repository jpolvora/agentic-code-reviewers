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

- Corrigir **somente threads do bot** (`AGENTIC_CODE_REVIEWERS_BOT_TAG`, ex.: `[Cursor Reviewer]`).
- Ignorar threads de humanos ou outros bots.
- **Não resolver** thread sem alteração comprovada na linha ancorada (`lineNumber`).

---

## Ordem de operações (gate cooperativo)

Ordem **obrigatória** em ambos os runtimes:

```
1. Ler threads ativas do bot
2. Investigar contexto (arquivo, testes, callers)
3. Aplicar correções cirúrgicas
4. Validar (testes locais quando aplicável)
5. git add + commit local
6. Responder e resolver threads corrigidas na PR
7. git push — SOMENTE se todas as resoluções tentadas tiverem sucesso
```

Se o passo 6 falhar (token, permissão, thread não encontrada): **não fazer push**. Deixe o commit local para inspeção ou push manual.

---

## Resposta na thread (paridade com code review)

Toda resolução deve incluir o marcador canônico (mesmo do runner de review):

```
<!-- resolution-reply -->
```

Corpo sugerido:

```markdown
[Cursor Reviewer]
<!-- resolution-reply -->

Issue addressed in the current iteration. Marking as resolved.

<explicação curta: causa raiz + o que mudou>
```

Auto-Fix CI usa `provider.resolvePullRequestReviewThreads`; solve-pr usa `resolve_thread.cjs` com o mesmo marcador.

---

## Mensagem de commit

Preferir Conventional Commits com referência à PR:

```
fix(review): resolve issues from review threads of PR #<N>
```

Auto-Fix CI gera automaticamente quando `pullRequestId` está disponível.

---

## Formato estruturado (Auto-Fix subagente)

O subagente Auto-Fix retorna JSON (`AUTO_FIX.md`):

- `explanation` — texto base da reply (por arquivo).
- `replacements[]` — intervalos `startLine`/`endLine`/`replacementContent`.
- Resolução de thread: só quando a **linha da thread** teve conteúdo alterado (gate TypeScript).

solve-pr pode usar edição direta **ou** o mesmo raciocínio; não é obrigado ao JSON de replacements.

---

## Contexto intra-review

Ao listar threads para correção, incluir sempre:

| Campo | Uso |
|-------|-----|
| `threadId` | Resolução na API (GitHub GraphQL ID ou ADO numérico) |
| `filePath` / `path` | Arquivo ancorado |
| `lineNumber` / `line` | Linha da review |
| `summary` | Primeiro comentário ou trecho do bot |

Isso permite casar tentativa de fix ↔ thread ↔ próxima rodada de code review.

---

## Token GitHub

Precedência (ambos os runtimes):

`AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN` → `GITHUB_TOKEN` → `GH_TOKEN`

PAT recomendado para `resolveReviewThread` (integration token do Actions frequentemente nega).
