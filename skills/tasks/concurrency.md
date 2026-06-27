# Diretivas — Concorrência

Foque em race conditions, deadlocks, uso incorreto de locks/async e estado compartilhado.

- Procure double-check sem lock, fire-and-forget sem await, e mutação de coleções durante iteração.
- Valide padrões async/await em código alterado e chamadores.
- Exija cenário de interleaving ou paralelismo real para publicar.
