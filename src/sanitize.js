import DOMPurify from "dompurify";
import { isSafeHref } from "./helpers.js";

export const DEFAULT_ALLOWED_TAGS = [
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "ul",
  "ol",
  "li",
  "blockquote",
  "a",
  "span",
];

export const DEFAULT_ALLOWED_ATTRIBUTES = ["href", "title", "data-rt-mention", "data-id", "contenteditable"];

/** Attributes that only carry meaning on a structured mention span. */
const MENTION_ATTRIBUTES = ["data-rt-mention", "data-id", "contenteditable"];

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
export function createSanitizeToDOMFragment(options = {}) {
  const allowedTags = options.allowedTags ?? DEFAULT_ALLOWED_TAGS;
  const allowedAttributes = options.allowedAttributes ?? DEFAULT_ALLOWED_ATTRIBUTES;

  return (html, editor) => {
    const root = editor.getRoot();
    const doc = root.ownerDocument;
    const sanitized = /** @type {DocumentFragment} */ (
      DOMPurify.sanitize(html, {
        ALLOWED_TAGS: allowedTags,
        ALLOWED_ATTR: allowedAttributes,
        ALLOW_DATA_ATTR: false,
        RETURN_DOM_FRAGMENT: true,
      })
    );

    const fragment = sanitized.ownerDocument === doc ? sanitized : doc.importNode(sanitized, true);

    for (const span of [...fragment.querySelectorAll("span")]) {
      const id = span.getAttribute("data-id")?.trim() ?? "";
      const type = span.getAttribute("data-rt-mention")?.trim() ?? "";
      const label = span.textContent?.trim() ?? "";
      if (!span.hasAttribute("data-rt-mention") || !id || !type || !label) {
        span.replaceWith(...span.childNodes);
        continue;
      }
      for (const attr of [...span.attributes]) {
        if (!MENTION_ATTRIBUTES.includes(attr.name)) span.removeAttribute(attr.name);
      }
      span.setAttribute("data-rt-mention", type);
      span.setAttribute("data-id", id);
      span.setAttribute("contenteditable", "false");
      span.textContent = label;
    }

    for (const element of fragment.querySelectorAll("[data-rt-mention], [data-id], [contenteditable]")) {
      if (element.localName === "span" && element.hasAttribute("data-rt-mention")) continue;
      for (const name of MENTION_ATTRIBUTES) element.removeAttribute(name);
    }

    for (const link of [...fragment.querySelectorAll("a")]) {
      if (!isSafeHref(link.getAttribute("href") ?? "")) link.replaceWith(...link.childNodes);
    }

    return fragment;
  };
}
