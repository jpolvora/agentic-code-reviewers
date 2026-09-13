# Specific Recommendations: TypeScript (Node.js/TypeScript)

You should focus on the following common patterns and issues when reviewing code in this stack:

## 1. Typing and Safety in TypeScript
*   **Avoid using `any`:**
    *   Using `any` overrides the safety benefits of the TypeScript compiler. Prefer using `unknown` (if the type is unknown and requires runtime validation) or creating proper interfaces and types.
*   **Strict Mode TypeScript:**
    *   Pay attention to possible errors related to `null` or `undefined`. Ensure there are appropriate nullability checks on optional properties.
*   **Type Assertions:**
    *   Avoid excessive use of `as Type` (type assertion) or exclamation marks (`!`) to force non-null types. Prefer explicit checks or guards (e.g., `if (value != null)`).

## 2. Node.js and ESM (ECMAScript Modules) Patterns
*   **Extensions in Relative Imports:**
    *   This project uses `"type": "module"` (ESM). All relative imports of local files **must** include the `.js` extension explicitly in the path (e.g., `import { foo } from './foo.js'`), even if the source files are `.ts`.
*   **Handling Promises and Async/Await:**
    *   Always handle Promise rejections. Avoid firing floating Promises in the background without `.catch()` or an enclosing `try/catch`.
*   **Resource and I/O Management:**
    *   Ensure file or stream reads and writes use safe resources (such as `node:fs` or `node:fs/promises` modules) and clean up/close open file descriptors to avoid memory leaks or resource leaks.

## 3. Test Quality and Code Structure
*   **Strict Assertions in Tests:**
    *   Prefer using strict assertions (e.g., `node:assert/strict`) to avoid false positives in unit tests.
    *   Avoid complex logic or calling actual external APIs inside unit tests without properly mocking resources.
