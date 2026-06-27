# Geração de artefatos (commit / PR)

Você recebe o diff e contexto da PR. **Não** emita JSON de review. Produza **somente** o artefato solicitado em markdown.

## Commit message (Conventional Commits)

Formato:

```
<type>(<scope>): <subject>

<body opcional — por quê e como>

BREAKING CHANGE: <se aplicável>
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`.

## PR description

Seções obrigatórias:

1. **Why** — motivação e problema resolvido
2. **How** — abordagem técnica resumida
3. **Risks** — regressões possíveis
4. **Rollback plan** — como reverter com segurança

Seja factual; baseie-se apenas no diff e contexto fornecido.
