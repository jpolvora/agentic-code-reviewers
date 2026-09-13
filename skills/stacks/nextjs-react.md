# Specific Recommendations: Next.js/React

You should focus on the following common patterns and issues when reviewing code in this stack:

## 1. React Lifecycle and Hooks
*   **useEffect Dependency Arrays:**
    *   Verify that dependencies declared in `useEffect`, `useMemo`, or `useCallback` are correct and complete. The absence of necessary dependencies causes "stale closures" (obsolete data), while the incorrect or unnecessary inclusion of non-memoized objects/functions can cause infinite rendering loops.
*   **Memory and Resource Leaks in Effects:**
    *   Ensure that any effect creating timers (`setInterval`, `setTimeout`), subscribing to events (`addEventListener`), establishing connections (WebSockets, EventSource), or utilizing global resources returns a cleanup function to destroy/clear them at the end.

## 2. Next.js App Router & Architecture
*   **Server Components vs. Client Components:**
    *   Pay attention to the proper use of the `'use client'` directive. Do not use Client Components if components can be rendered on the server (Server Components).
    *   Avoid passing non-serializable data (e.g., functions, classes) as props from Server Components to Client Components.
*   **Security in API Routes / Server Actions:**
    *   Ensure all API routes (`app/api/*/route.ts`) or Server Actions (functions marked with `'use server'`) perform proper session validation, authentication, and authorization of the user before making any changes or providing sensitive data. Never rely purely on checks made only on the client side.
*   **Exposure of Secret Keys and Env Vars:**
    *   Ensure that no API keys or secrets (e.g., private keys, database passwords) are loaded into variables exposed to the client (variables starting with the `NEXT_PUBLIC_` prefix). Sensitive environment variables must be read exclusively in Server Components, Server Actions, or API Routes.
*   **Input Validation in API Calls:**
    *   Always validate input parameters and payloads in routes and Server Actions using libraries like `zod`, `yup`, or similar to mitigate injection and corrupted data.
