---
name: solve-pr
description: Skill agêntica para buscar as threads ativas de uma PR do GitHub, analisar os problemas, propor correções, implementar soluções, fazer commit, push e aguardar a próxima rodada de code review.
---

# Instruções de Uso da Skill `solve-pr`

Esta skill orienta o agente no fluxo completo de resolução automática de issues levantadas por rodadas de code review em Pull Requests do GitHub.

---

## Fluxo de Execução Passo a Passo

### Passo 1: Recuperação de Threads Ativas
Execute o script utilitário de busca de threads passando o ID da Pull Request correspondente. Esse script utiliza a API GraphQL do GitHub para coletar threads de revisão de código que continuam abertas/não resolvidas.

```bash
node .agents/skills/solve-pr/scripts/fetch_threads.cjs <PR_ID>
```
> [!IMPORTANT]
> Certifique-se de que a variável de ambiente `GITHUB_TOKEN` ou `GH_TOKEN` está definida no ambiente com as permissões de leitura/escrita apropriadas para o repositório.

### Passo 2: Investigação e Análise das Issues
Para cada thread ativa listada na saída do script:
1. Localize o arquivo e a linha afetada (ex: `src/config.ts:773`).
2. Utilize as ferramentas de leitura (`view_file`, `grep_search`) para examinar o contexto completo em torno do trecho reportado.
3. Consulte testes unitários, dependências ou documentação de arquitetura associada para entender as implicações do bug e evitar regressões.

### Passo 3: Elaboração do Plano de Correção
Crie ou atualize o artefato `implementation_plan.md` no workspace contendo:
*   As causas raiz de cada falha.
*   A solução técnica precisa que será aplicada.
*   O plano de testes e validação automática.

### Passo 4: Implementação das Soluções
*   Escreva as correções cirúrgicas necessárias nos arquivos afetados.
*   Adicione ou atualize os testes correspondentes (por exemplo, em `test/` ou na stack correspondente) para garantir a cobertura contra a regressão do problema.

### Passo 5: Validação e Testes Locais
Execute a suíte de testes locais para certificar-se de que todo o código compila e que nenhum comportamento existente foi quebrado:
```bash
npm test
```

### Passo 6: Responder e Resolver as Threads no GitHub
Após comprovar que a solução funciona e os testes passam, responda com uma nota explicativa da correção e marque as threads afetadas como resolvidas (fechadas) no GitHub. Use o script utilitário `resolve_thread.cjs`:
```bash
node .agents/skills/solve-pr/scripts/resolve_thread.cjs <THREAD_ID> "Nota explicando como a issue foi resolvida"
```
Isso evita que o revisor analise novamente e alerte sobre um problema que já foi corrigido.

### Passo 7: Commit, Push e Disparo de Nova Rodada
Com as threads resolvidas e o código validado:
1. Adicione os arquivos modificados ao stage do Git:
   ```bash
   git add <arquivos-modificados>
   ```
2. Realize o commit local seguindo as convenções do repositório (ex: Conventional Commits):
   ```bash
   git commit -m "fix(config): resolve issues identified in review threads of PR #<PR_ID>"
   ```
3. Envie as modificações para a branch remota para disparar a nova rodada do pipeline automatizado:
   ```bash
   git push origin <sua-branch>
   ```

### Passo 8: Aguardar a Próxima Rodada
Acompanhe os logs da execução e aguarde até que o bot de code review publique os resultados da nova rodada. Se novos problemas forem levantados ou persistirem, reinicie o ciclo a partir do **Passo 1**.
