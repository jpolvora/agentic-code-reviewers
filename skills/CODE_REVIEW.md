# Code Review — Harness do Projeto

Critérios técnicos e de negócio vivem no **repositório analisado** (`cwd`). Este runner é portável — consulte o harness via tools; não invente checklist paralelo.

`settingSources: ['project']` expõe `AGENTS.md`, `.cursor/rules/` e `.agents/skills/`.

---

## Fontes do projeto (ler via tools na Fase 2)

O runner **pré-mapeia** `.cursor/rules/*.mdc` por glob dos arquivos alterados — consulte a seção *Rules do projeto* no prompt antes de abrir o índice inteiro.

| Prioridade | Caminho | Uso |
|------------|---------|-----|
| 1 | `AGENTS.md` | Defaults e roteamento de rules/skills |
| 2 | `.cursor/rules/main.mdc` | Índice — carregue rules dos globs dos arquivos alterados |
| 3 | `.agents/skills/code-review/SKILL.md` | Brechas, checklist e rigor **do projeto** |
| 4 | `docs/` | Regras de negócio quando o diff tocar domínio ou arquitetura |

Se uma skill estiver ausente, documente a lacuna em `analysis` e aplique senso crítico mínimo (segurança, autorização, integridade de dados).

---

## Validação de Pipeline e Ambiente
Como parte do rigor investigativo, se o diff envolver arquivos de orquestração de ambiente ou CI/CD (GitHub Actions, pipelines Azure DevOps `.yml`, ou scripts de build):
- Assuma a postura de um **Engenheiro DevSecOps**.
- Investigue vulnerabilidades (e.g., permissões abertas demais, injeção de comandos, falta de pin de dependências).
- Garanta que a estrutura da pipeline esteja correta e atualizada com práticas modernas. Proponha arquiteturas mais elegantes se a configuração estiver frágil.

---

**Formato de saída:** prevalece o System Prompt (JSON desta pipeline), não o markdown de relatório das skills do projeto.

Quando `AGENTIC_CODE_REVIEWERS_MCP_ENABLED=true`, o runner pode pré-coletar saída de lint/testes configurados — **observação somente leitura**; não execute comandos destrutivos nem modifique arquivos.
