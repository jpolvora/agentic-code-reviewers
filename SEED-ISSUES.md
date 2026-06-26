# Seed issues — validação do Cursor Reviewer

> **Artefatos seed não vão para produção.** Fonte canônica: `fixtures/seed/`. O workspace recebe cópias temporárias só durante o teste.

## Objetivo

Validar que o `cursor-reviewer` detecta **6 cenários intencionais** (3 backend, 3 frontend), publica `suggestedFix` e reporta issues na PR — sem self-review do próprio runner e **sem commits artificiais**.

| ID | Camada | Problema | Obrigatório no teste |
|----|--------|----------|----------------------|
| SEED-B1 | Backend | DELETE sem `[Authorize]` | Sim |
| SEED-B2 | Backend | `.Result` em async | Sim |
| SEED-B3 | Backend | `Guid.Empty` não rejeitado | Sim |
| SEED-F1 | Frontend | `[innerHTML]` XSS | Não* |
| SEED-F2 | Frontend | Botão sem `*abpPermission` | Sim |
| SEED-F3 | Frontend | `atob` sem validar base64 | Sim |

\* SEED-F1 pode ser descartado pelo anti-falso-positivo quando o componente não está em rotas. O teste exige **mínimo 5/5 obrigatórios**.

## Estrutura

```
scripts/cursor-reviewer/
├── fixtures/seed/                    # Fonte canônica (versionada)
│   ├── expected-scenarios.json       # Critérios de aceite do teste
│   ├── sample-evaluate-output.txt    # Amostra mínima p/ testes unitários (sem agente)
│   ├── backend/CursorReviewerSeedAppService.cs
│   └── frontend/cursor-reviewer-seed.component.*
├── src/seed/                         # install / uninstall / evaluate
└── test/seed.test.ts                 # Testes automatizados
```

**Cópias temporárias no repo (só durante teste)** — paths detectados dinamicamente:

- `src/*Application/CursorReviewerSeed/` (camada Application ABP)
- `<angular>/src/app/cursor-reviewer-seed/` (ex.: `angular/src/app/...`)

## Como executar

### Teste E2E (recomendado — exige `CURSOR_API_KEY`)

```bash
cd scripts/cursor-reviewer
npm run test:seed
```

Fluxo:

1. `seed:install` — copia fixtures para `src/` e `angular/` (**arquivos em disco, sem commit**)
2. `npm run review -- --dry-run --include-uncommitted --seed-test` — diff inclui working tree; prompt de validação seed
3. Avalia output contra `expected-scenarios.json`
4. `seed:uninstall` — remove cópias do workspace

> `--include-uncommitted` (ativado por `--seed-test`) une o diff de branch com staged/unstaged/untracked vs `HEAD`. Não é necessário commitar os arquivos seed.

### Reavaliar um output capturado manualmente (debug)

```bash
npm run test:seed -- --evaluate-only caminho/do/output.txt
```

### Testes unitários (CI, sem agente)

```bash
npm test
```

Valida manifest, fixtures, diff uncommitted e o parser de avaliação (`sample-evaluate-output.txt`).

### Manter seeds no workspace após o teste

```bash
npm run test:seed -- --keep-seeds
```

### Garantir workspace limpo antes do push

```bash
npm run seed:uninstall
npm run seed:verify-clean
```

## Proteção contra deploy

| Camada | Mecanismo |
|--------|-----------|
| **Backend** | `src/*Application/*.csproj` → `<Compile Remove="CursorReviewerSeed\**\*.cs" />` — nunca compila nem expõe Auto API |
| **Frontend** | Componente **não** registrado em rotas/módulos — código morto |
| **Runner** | `scripts/cursor-reviewer/**` excluído do diff por padrão |
| **CI** | `npm run seed:verify-clean` falha se pastas seed existirem no workspace |

> No modo `--seed-test`, o prompt instrui o agente a avaliar **padrões de código** nos arquivos seed, ignorando `Compile Remove`/rotas como desculpa para omitir achados.

## Checklist antes do merge em `master`

- [ ] `npm run seed:uninstall` executado
- [ ] `npm run seed:verify-clean` passa
- [ ] `rg "CURSOR-REVIEWER-SEED" src/ angular/` sem resultados
- [ ] `npm test` passa na pasta `scripts/cursor-reviewer`
