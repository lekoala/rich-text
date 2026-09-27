/** `|` separates toolbar groups. */
export declare const TOOLBAR_SEPARATOR = "|";
export declare const DEFAULT_TOOLBAR: string[];
export type SuggestionMatch = {
    trigger: string;
    query: string;
    start: number;
};
/**
 * @typedef {Object} SuggestionMatch
 * @property {string} trigger
 * @property {string} query
 * @property {number} start
 */
/**
 * Normalize a toolbar declaration while rejecting unknown commands. `|` starts a new group; empty groups
 * and leading/trailing separators are dropped.
 * @param {string[] | string | null | undefined} value
 * @returns {string[]}
 */
export declare function normalizeToolbar(value: string[] | string | null | undefined): string[];
/**
 * Split a normalized toolbar into its groups.
 * @param {string[]} toolbar
 * @returns {string[][]}
 */
export declare function toolbarGroups(toolbar: string[]): string[][];
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