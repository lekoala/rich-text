export const DEFAULT_TOOLBAR = [
  "bold",
  "italic",
  "bullet-list",
  "ordered-list",
  "link",
  "blockquote",
  "undo",
  "redo",
];

const TOOLBAR_COMMANDS = new Set(DEFAULT_TOOLBAR);

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
export function normalizeToolbar(value) {
  if (value == null) return [...DEFAULT_TOOLBAR];
  const entries = Array.isArray(value) ? value : String(value).split(/[\s,]+/);
  if (entries.length === 1 && entries[0] === "none") return [];

  /** @type {string[]} */
  const result = [];
  for (const entry of entries) {
    if (!entry || !TOOLBAR_COMMANDS.has(entry) || result.includes(entry)) continue;
    result.push(entry);
  }
  return result;
}

/**
 * Find the active trigger/query in one text node before the caret.
 * Triggers only start at a text boundary; the query itself cannot contain whitespace.
 * @param {string} textBeforeCaret
 * @param {string[]} triggers
 * @returns {SuggestionMatch | null}
 */
export function matchSuggestionText(textBeforeCaret, triggers) {
  let best = null;

  for (const trigger of triggers) {
    if (!trigger) continue;
    const start = textBeforeCaret.lastIndexOf(trigger);
    if (start < 0) continue;
    const before = start === 0 ? "" : textBeforeCaret[start - 1];
    if (before && !/[\s([{]/.test(before)) continue;

    const query = textBeforeCaret.slice(start + trigger.length);
    if (/\s/.test(query)) continue;

    if (!best || start > best.start || (start === best.start && trigger.length > best.trigger.length)) {
      best = { trigger, query, start, end: textBeforeCaret.length };
    }
  }

  return best;
}

/**
 * Accept relative/hash URLs and a deliberately small set of schemes.
 * @param {string} href
 * @returns {boolean}
 */
export function isSafeHref(href) {
  const value = String(href ?? "").trim();
  if (!value) return false;
  if (value.startsWith("#") || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }

  try {
    const url = new URL(value, "https://example.invalid/");
    return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol);
  } catch {
    return false;
  }
}

/**
 * @param {HTMLElement} root
 * @returns {boolean}
 */
export function isEditorEmpty(root) {
  if (root.querySelector("[data-rt-mention], img")) return false;
  return !(root.textContent ?? "").replace(/[\s\u00a0\u200b]+/g, "").length;
}

/**
 * @param {Element} element
 * @returns {{ type: string, id: string, label: string } | null}
 */
export function mentionFromElement(element) {
  if (!(element instanceof HTMLElement) || !element.hasAttribute("data-rt-mention")) return null;
  const type = element.getAttribute("data-rt-mention") || "mention";
  const id = element.getAttribute("data-id") || "";
  return { type, id, label: element.textContent ?? "" };
}
