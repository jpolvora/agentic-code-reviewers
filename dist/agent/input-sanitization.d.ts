export declare const DEFAULT_MAX_USER_CONTENT_CHARS = 12000;
/**
 * Truncates and wraps user-authored PR/work-item text to reduce prompt-injection
 * surface while preserving legitimate content for the reviewer.
 */
export declare function sanitizeUserProvidedContent(label: string, content: string, maxChars?: number): string;
//# sourceMappingURL=input-sanitization.d.ts.map