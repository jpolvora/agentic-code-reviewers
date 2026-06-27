# Fluxo de Auto-Fix (Self-Healing Loop)

O **Agentic Code Reviewers** suporta um fluxo automatizado e contínuo de revisão e correção de código (Auto-Fix). Esse processo cria um ciclo de *self-healing* (auto-cura) em que o código é iterativamente revisado, corrigido e validado até que todas as pendências sejam resolvidas ou atinjam o limite de rodadas.

## Como funciona o ciclo

O ciclo de Auto-Fix envolve a coordenação de duas pipelines separadas: a **revisão** (`code-review.yml`) e a **correção** (`auto-fix.yml`). O fluxo acontece da seguinte forma:

1. **Gatilho Inicial:** O desenvolvedor faz *push* de código em uma Pull Request.
2. **Revisão:** A pipeline de Code Review (`Agentic Code Review`) analisa o código. Se encontrar problemas, publica comentários na PR.
3. **Gatilho de Auto-Fix:** Através do evento `workflow_run` (no GitHub Actions), a conclusão da pipeline de revisão aciona automaticamente a pipeline de Auto-Fix.
4. **Correção:** O agente de Auto-Fix:
   - Lê as *threads* ativas (comentários não resolvidos) na PR.
   - Analisa o código e propõe correções para cada problema.
   - Aplica as mudanças no código local.
   - Gera commit local, resolve threads e faz push (gate cooperativo — ver [`COOPERATIVE_FIX.md`](../skills/COOPERATIVE_FIX.md)).
5. **Re-avaliação (O Loop):** O *push* gerado pelo Auto-Fix re-aciona a pipeline de Code Review (passo 2). O revisor avalia o novo código. Se a thread foi consertada, ele a marca como resolvida. Caso contrário, deixa novos apontamentos.

## Proteções do Sistema

Um ciclo contínuo de máquina (avaliação e correção) levanta a preocupação com **loops infinitos** e **concorrência**. O sistema já foi desenhado com proteções contra esses cenários:

### 1. Loop Infinito e Convergência (Round Escalamiento)
O revisor controla quantas rodadas de revisão/correção já ocorreram utilizando um comentário invisível na PR (`<!-- reviewer-round-state -->`). Se a correção falhar repetidas vezes em resolver os problemas após um número máximo de tentativas (configurável via `AGENTIC_CODE_REVIEWERS_MAX_ROUNDS`, default: 5):
- O revisor para de gerar sugestões e avisos (threads de prioridade menor).
- Deixa apenas as *issues* críticas abertas (se houver).
- Gera um alerta pedindo **revisão humana** (escalonamento).
- Isso garante que a pipeline de Auto-Fix não ficará gastando minutos de CI tentando consertar algo além de sua capacidade ou que esteja sofrendo alucinação.

### 2. Detecção de Mudanças (No-op)
Se o agente de Auto-Fix processar as threads, mas não conseguir formular mudanças concretas no código, o script detecta working tree limpa e termina sem commit. **Sem commit, sem resolução, sem push.**

### 3. Gate cooperativo (resolve → push)
Ordem alinhada à skill IDE [`solve-pr`](../.agents/skills/solve-pr/SKILL.md) e ao contrato [`COOPERATIVE_FIX.md`](../skills/COOPERATIVE_FIX.md):

1. Commit **local**
2. Responder e resolver threads na PR
3. Push **somente** se todas as resoluções tentadas tiverem sucesso

Se a resolução falhar (token, permissão), o commit local é preservado e o push é abortado.

### 4. Concorrência e Execução Sequencial (Sem sobreposição)

- **`concurrency` por PR** no job (`auto-fix-<pr_number>`) — execuções sobrepostas enfileiradas.
- **Engines sequenciais:** cursor-sdk → sync condicional (preserva commits locais não enviados) → opencode.
- **Resolução parcial:** só threads cuja linha teve conteúdo alterado.
- **Falha explícita** se todos os engines configurados falharem.

### 5. Gatilho após review manual

O job aceita `workflow_run` bem-sucedido independentemente do evento original (`pull_request` ou `workflow_dispatch`).

## Configuração Necessária (GitHub Actions)

Para que o loop funcione, o `git push` feito pelo script de Auto-Fix deve conseguir re-acionar a pipeline de `pull_request` (`code-review.yml`).

> [!WARNING]
> O token padrão do GitHub Actions (`secrets.GITHUB_TOKEN`) **previne intencionalmente** a invocação de outros workflows a fim de evitar loops acidentais. Se a sua pipeline usar esse token, a revisão *não será* acionada e o ciclo irá parar na primeira correção (o código será ajustado, mas o *feedback* sobre a correção só ocorrerá quando um humano acionar a pipeline ou fizer push).

Para habilitar o loop contínuo:
1. Crie um **Personal Access Token (PAT)** no GitHub, utilizando uma conta de serviço, *bot*, ou a sua própria conta. O token precisa de permissões de leitura e escrita em repositório (`repo` nos *classic tokens* ou permissão de código/PRs nos *fine-grained*).
2. Adicione este PAT como um Secret (ex: `AGENTIC_CODE_REVIEWERS_GITHUB_TOKEN`) nas configurações do repositório.
3. Configure a pipeline de auto-fix para passar este token ao script.

### Exemplo

Você pode usar as implementações na própria raiz deste projeto como referência:
- [`.github/workflows/code-review.yml`](../.github/workflows/code-review.yml)
- [`.github/workflows/auto-fix.yml`](../.github/workflows/auto-fix.yml)
