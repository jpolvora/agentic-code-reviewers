# Especificação do Produto: Revisor de Código Baseado em Agente (Agentic Code Reviewer)

Este documento descreve a engenharia reversa do produto em alto nível, detalhando o fluxo de execução, árvores de decisão e regras de negócio. O objetivo é fornecer um guia agnóstico de tecnologia, estruturado por tópicos e critérios de aceite, permitindo a recriação do sistema em qualquer stack ou linguagem.

---

## 1. Inicialização e Configuração
**Especificação:** O sistema deve configurar seus parâmetros de operação a partir de fontes externas antes de iniciar o processamento.
**Critérios:**
- Deve carregar variáveis de ambiente e argumentos de linha de comando.
- Deve determinar o modo de execução (Ex: Pipeline Contínua, Simulação Local/Dry-Run, Modo de Correção Automática).
- Deve identificar o motor de Inteligência Artificial e o modelo a ser utilizado.
- Deve identificar a stack tecnológica alvo (via autodetecção ou configuração manual).
- Deve extrair o contexto do controle de versão (ID do Pull Request, Branch de Origem, Branch de Destino, Caminho do Repositório, Provedor da plataforma).

## 2. Preparação do Espaço de Trabalho e Análise de Diferenças (Diff)
**Especificação:** O sistema deve identificar com precisão qual código foi alterado para focar a análise.
**Critérios:**
- Deve preparar um espaço de trabalho (workspace) local que represente o estado da branch de origem.
- Deve gerar a diferença (diff) entre a branch de origem e a branch de destino.
- Deve aplicar regras de filtragem baseadas em padrões de inclusão e exclusão (ex: ignorar arquivos autogerados, focar em extensões específicas).
- Deve calcular métricas sobre a alteração (número de arquivos modificados, tamanho em bytes).
- O sistema deve encerrar a execução de forma elegante (sem erros) caso nenhum arquivo elegível seja encontrado e não haja contexto de Pull Request.

## 3. Coleta de Contexto do Pull Request
**Especificação:** O sistema deve integrar-se à plataforma de controle de versão para coletar metadados que enriqueçam a compreensão da Inteligência Artificial.
**Critérios:**
- Deve estabelecer conexão com o provedor configurado.
- Deve recuperar o título e a descrição do Pull Request para entender o objetivo de negócio da alteração.
- Deve recuperar itens de trabalho (tickets/cards) vinculados, se suportado pelo provedor, para entender os requisitos.
- Deve recuperar todas as threads e comentários de revisão existentes para evitar feedback duplicado e rastrear problemas previamente identificados.

## 4. Roteamento de Modo de Execução
**Especificação:** O sistema deve suportar diferentes fluxos de trabalho baseados na configuração inicial.
**Critérios:**
- **Fluxo A (Correção Automática / Auto-Fix):** Se configurado para remediação, deve desviar para o fluxo de Correção Automática.
- **Fluxo B (Geração de Artefatos):** Se configurado para gerar descrições de Pull Request ou mensagens de commit, deve desviar para o fluxo Gerador de Artefatos.
- **Fluxo C (Revisão Padrão):** Por padrão, deve seguir para o fluxo principal de Revisão de Código.

## 5. Fluxo Principal de Revisão de Código (Execução do Agente)
**Especificação:** O sistema deve analisar as alterações de código utilizando um motor de Inteligência Artificial para identificar defeitos, vulnerabilidades ou melhorias.
**Critérios:**
- Deve formatar as diferenças de código em uma estrutura otimizada para o consumo da IA.
- Deve injetar regras customizadas do projeto e diretrizes arquiteturais no prompt de contexto.
- **Escalabilidade:** Se a alteração for excessivamente grande (ultrapassando um limite de arquivos), o sistema deve dividir os arquivos em lotes (chunks) e executar múltiplos agentes em paralelo, consolidando os resultados posteriormente.
- Deve invocar o motor de IA e receber uma resposta estruturada contendo os problemas identificados e as threads consideradas resolvidas pelo desenvolvedor.

## 6. Validação de Resposta e Gatekeeping (Safe Outputs)
**Especificação:** O sistema deve validar deterministicamente a saída da IA para prevenir alucinações, vazamentos e comentários inválidos.
**Critérios:**
- **Ancoragem de Linha:** Qualquer problema relatado deve obrigatoriamente apontar para uma linha que foi de fato modificada na alteração (diff).
- **Caminhos Protegidos:** O sistema deve rejeitar comentários em arquivos sensíveis (ex: fluxos de CI/CD, arquivos de lock, credenciais).
- **Limiares de Severidade e Pontuação:** A pontuação do problema deve ser coerente com sua severidade e deve ser igual ou superior ao limite mínimo configurado pelo usuário.
- **Integridade Estrutural:** A explicação do problema deve seguir uma estrutura obrigatória (ex: Evidência, Cenário, Proteção, Descarte) para garantir um embasamento técnico rigoroso.
- **Segurança de Conteúdo:** O sistema deve bloquear saídas que contenham padrões de credenciais, segredos ou formatação perigosa (ex: injeção de HTML/Scripts).

## 7. Gerenciamento de Iterações e Escalonamento (Rounds)
**Especificação:** O sistema deve rastrear a quantidade de ciclos de revisão em um mesmo Pull Request para forçar a convergência e evitar loops infinitos de correção/revisão.
**Critérios:**
- Deve determinar o número da iteração (round) atual com base no histórico de threads da plataforma.
- Se a contagem de iterações exceder um limite máximo predefinido:
  - Deve suprimir (ocultar) todos os apontamentos não críticos (sugestões, avisos).
  - Deve reter apenas apontamentos críticos (ex: falhas de segurança ou quebra de regras de negócio).
  - Deve adicionar uma mensagem de aviso na plataforma indicando que o limite de revisões automatizadas foi atingido e que intervenção humana é recomendada.

## 8. Publicação na Plataforma e Gestão de Threads
**Especificação:** O sistema deve refletir os resultados validados de volta na plataforma de controle de versão.
**Critérios:**
- **Simulação (Dry-Run):** Se executado em modo de simulação, o sistema deve apenas registrar as ações pretendidas no console (logs), sem alterar o estado remoto.
- **Resolução de Threads:** Deve fechar/marcar como "resolvidas" as threads pendentes que a IA determinou que foram corrigidas pelo desenvolvedor no novo código.
- **Criação de Threads:** Deve publicar os novos problemas validados como comentários/threads no arquivo e linha específicos.
- **Comentário de Resumo:** Se não houver mais threads automatizadas pendentes, o sistema deve publicar um comentário final de resumo atestando a qualidade.
- **Persistência de Estado:** Deve persistir o estado da iteração atual (número do round) na plataforma (ex: através de um marcador oculto em um comentário) para ser lido na próxima execução.

## 9. Fluxo Cooperativo de Correção Automática (Auto-Fix)
**Especificação:** O sistema deve ser capaz de gerar e aplicar correções automaticamente para threads de revisão previamente identificadas.
**Critérios:**
- Deve filtrar as threads de revisão ativas que possuem arquivos e linhas como alvo.
- Deve agrupar as threads por arquivo e lançar subagentes de IA em paralelo para gerar substituições cirúrgicas de código.
- Deve validar se as substituições geradas são estruturalmente válidas (intervalos de linha corretos, sem sobreposições).
- Deve verificar deterministicamente se a correção gerada altera de fato a linha apontada pela thread original.
- Deve realizar o commit das alterações localmente e executar um passo de validação/build local para garantir que o código compila. Deve abortar a operação se o build falhar.
- Após sucesso no build, deve resolver as threads correspondentes na plataforma e realizar o push do commit para o repositório remoto.

## 10. Avaliação do Portão de Qualidade (Pipeline Gate)
**Especificação:** O sistema deve determinar o estado final de sucesso ou falha da execução para integração com sistemas de Integração Contínua (CI/CD).
**Critérios:**
- Se houver threads pendentes não resolvidas ou se novos problemas críticos foram publicados, o sistema deve falhar o portão (encerrar a execução com código de erro, bloqueando o Pull Request).
- Se todas as threads foram resolvidas e não existem novos apontamentos acima do limite de severidade, o sistema deve aprovar o portão (encerrar com código de sucesso).
- Deve emitir variáveis de saída padronizadas para que a pipeline de CI/CD tenha observabilidade sobre o resultado exato da revisão.
