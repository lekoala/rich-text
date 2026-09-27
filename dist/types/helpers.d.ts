export declare const DEFAULT_TOOLBAR: string[];
export type SuggestionMatch = {
    trigger: string;
    query: string;
    start: number;
    end: number;
};
/**
 * @typedef {Object} SuggestionMatch
 * @property {string} trigger
 * @property {string} query
 * @property {number} start
 * @property {number} end
 */
/**
 * Normalize a toolbar declaration while rejecting unknown commands.
 * @param {string[] | string | null | undefined} value
 * @returns {string[]}
 */
export declare function normalizeToolbar(value: string[] | string | null | undefined): string[];
/**
 * Find the active trigger/query in one text node before the caret.
 * Triggers only start at a text boundary; the query itself cannot contain whitespace.
 * @param {string} textBeforeCaret
 * @param {string[]} triggers
 * @returns {SuggestionMatch | null}
 */
export declare function matchSuggestionText(textBeforeCaret: string, triggers: string[]): SuggestionMatch | null;
/**
 * Accept relative/hash URLs and a deliberately small set of schemes.
 * @param {string} href
 * @returns {boolean}
 */
export declare function isSafeHref(href: string): boolean;
/**
 * @param {HTMLElement} root
 * @returns {boolean}
 */
export declare function isEditorEmpty(root: HTMLElement): boolean;
/**
 * @param {Element} element
 * @returns {{ type: string, id: string, label: string } | null}
 */
export declare function mentionFromElement(element: Element): {
    type: string;
    id: string;
    label: string;
} | null;
//# sourceMappingURL=helpers.d.ts.map