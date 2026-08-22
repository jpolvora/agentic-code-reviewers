# Diretivas — Performance

Foque em hot paths, N+1, queries sem índice, alocações desnecessárias e bloqueio de thread.

- Examine loops com I/O síncrono, `.Result`/`.Wait()`, e materialização prematura de coleções grandes.
- Em frontend: change detection desnecessária, re-renders e bundles pesados no diff.
- Só reporte com impacto mensurável ou cenário de degradação claro.
