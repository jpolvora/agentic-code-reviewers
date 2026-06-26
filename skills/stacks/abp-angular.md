# Recomendações Específicas: ABP/Angular (C#/.NET/ABP/Angular)

Você deve focar nos seguintes padrões e problemas comuns ao revisar código desta stack:

## 1. Frontend Angular & Typescript
*   **Vazamento de Memória (Memory Leaks) em Componentes:**
    *   Certifique-se de que todas as subscrições a `Observable`s no componente sejam limpas ao destruir o componente (usando o operador `takeUntil` com um `Subject` disparado no `ngOnDestroy`, ou convertendo para promises/usando o pipe `async` no template HTML).
*   **Segurança e Permissões:**
    *   Verifique se as ações e elementos interativos do template usam diretivas de permissão do ABP como `*abpPermission` ou se os componentes injetam `PermissionCheckerService` antes de exibir botões confidenciais ou executar lógicas restritas.
*   **Tipagem estrita:**
    *   Evite o uso do tipo `any` sem justificativa sólida. Prefira DTOs e interfaces typescript mapeadas a partir das APIs C#.

## 2. Backend C# / .NET / ABP Framework
*   **Programação Assíncrona:**
    *   Evite bloquear chamadas assíncronas utilizando propriedades ou métodos síncronos como `.Result`, `.Wait()` ou `.GetAwaiter().GetResult()`. Isso pode travar a thread pool (thread pool starvation). Use sempre `async` e `await` propagando até o entrypoint.
*   **Autorização e Segurança:**
    *   Endpoints em classes que herdam de `ApplicationService` ou Controllers devem possuir decoradores de autorização explícitos (ex: `[Authorize]`, `[AbpAuthorize]`).
*   **Validação de DTOs:**
    *   Verifique se DTOs de entrada possuem anotações de validação apropriadas (ex: `[Required]`, `[StringLength]`, `[EmailAddress]`). Evite receber strings ou tipos primitivos sem validação.
*   **EF Core / Performance:**
    *   Cuidado com consultas que carregam grandes volumes de dados desnecessariamente. Use `.AsNoTracking()` para queries de somente leitura.
    *   Certifique-se de que não haja queries N+1 causadas por laços que executam consultas individualmente (use `.Include` ou projete com `.Select`).
