export declare const DEFAULT_ALLOWED_TAGS: string[];
export declare const DEFAULT_ALLOWED_ATTRIBUTES: string[];
/**
 * Build the mandatory Squire HTML sanitizer.
 * `span` is only retained for structured mentions; other spans are unwrapped.
 * @param {{ allowedTags?: string[], allowedAttributes?: string[] }} [options]
 * @returns {(html: string, editor: import("squire-rte").default) => DocumentFragment}
 */
export declare function createSanitizeToDOMFragment(options?: {
    allowedTags?: string[];
    allowedAttributes?: string[];
}): (html: string, editor: import("squire-rte").default) => DocumentFragment;
//# sourceMappingURL=sanitize.d.ts.map