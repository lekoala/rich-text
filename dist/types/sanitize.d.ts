export declare const DEFAULT_ALLOWED_TAGS: string[];
export declare const DEFAULT_ALLOWED_ATTRIBUTES: string[];
/**
 * Build the mandatory Squire HTML sanitizer.
 * - `span` is only retained for structured mentions; other spans are unwrapped. A mention label is plain text.
 * - Mention attributes are removed from every other element (a stray `contenteditable` could otherwise
 *   re-enable editing inside a readonly editor, or create non-mention atomic islands).
 * - Links follow the same policy as the toolbar (`isSafeHref`); a link with a missing or refused href is
 *   unwrapped to its text.
 * @param {{ allowedTags?: string[], allowedAttributes?: string[] }} [options]
 * @returns {(html: string, editor: import("squire-rte").default) => DocumentFragment}
 */
export declare function createSanitizeToDOMFragment(options?: {
    allowedTags?: string[];
    allowedAttributes?: string[];
}): (html: string, editor: import("squire-rte").default) => DocumentFragment;
//# sourceMappingURL=sanitize.d.ts.map