/**
 * The mandatory Squire HTML sanitizer (Squire's `sanitizeToDOMFragment` hook).
 * - `span` is only retained for structured mentions; other spans are unwrapped. A mention label is plain text.
 * - Mention attributes are removed from every other element (a stray `contenteditable` could otherwise
 *   re-enable editing inside a readonly editor, or create non-mention atomic islands).
 * - Links follow the same policy as the toolbar (`isSafeHref`); a link with a missing or refused href is
 *   unwrapped to its text.
 * @param {string} html
 * @param {import("squire-rte").default} editor
 * @returns {DocumentFragment}
 */
export declare function sanitizeToDOMFragment(html: string, editor: import("squire-rte").default): DocumentFragment;
//# sourceMappingURL=sanitize.d.ts.map