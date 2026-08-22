# Specific Recommendations: ABP/Angular (C#/.NET/ABP/Angular)

You should focus on the following common patterns and issues when reviewing code in this stack:

## 1. Angular & TypeScript Frontend
*   **Memory Leaks in Components:**
    *   Ensure that all subscriptions to `Observable`s in the component are cleaned up when the component is destroyed (using the `takeUntil` operator with a `Subject` triggered in `ngOnDestroy`, converting to promises, or using the `async` pipe in the HTML template).
*   **Security and Permissions:**
    *   Check if actions and interactive elements in the template use ABP permission directives like `*abpPermission` or if components inject `PermissionCheckerService` before displaying sensitive buttons or executing restricted logic.
*   **Strict Typing:**
    *   Avoid using the `any` type without a solid justification. Prefer TypeScript DTOs and interfaces mapped from C# APIs.

## 2. C# / .NET / ABP Framework Backend
*   **Asynchronous Programming:**
    *   Avoid blocking asynchronous calls using synchronous properties or methods like `.Result`, `.Wait()`, or `.GetAwaiter().GetResult()`. This can cause thread pool starvation. Always use `async` and `await`, propagating them up to the entry point.
*   **Authorization and Security:**
    *   Endpoints in classes inheriting from `ApplicationService` or Controllers must have explicit authorization decorators (e.g., `[Authorize]`, `[AbpAuthorize]`).
*   **DTO Validation:**
    *   Check if input DTOs have appropriate validation annotations (e.g., `[Required]`, `[StringLength]`, `[EmailAddress]`). Avoid receiving raw strings or primitive types without validation.
*   **EF Core / Performance:**
    *   Watch out for queries that load large volumes of data unnecessarily. Use `.AsNoTracking()` for read-only queries.
    *   Ensure there are no N+1 queries caused by loops executing queries individually (use `.Include` or project with `.Select`).
