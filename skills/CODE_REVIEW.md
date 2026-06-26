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

**Formato de saída:** prevalece o System Prompt (JSON desta pipeline), não o markdown de relatório das skills do projeto.
