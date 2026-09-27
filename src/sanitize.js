import DOMPurify from "dompurify";

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

/**
 * Build the mandatory Squire HTML sanitizer.
 * `span` is only retained for structured mentions; other spans are unwrapped.
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
      if (span.hasAttribute("data-rt-mention")) {
        const id = span.getAttribute("data-id")?.trim() ?? "";
        const type = span.getAttribute("data-rt-mention")?.trim() ?? "";
        if (!id || !type || !span.textContent?.trim()) {
          span.replaceWith(...span.childNodes);
          continue;
        }
        for (const attr of [...span.attributes]) {
          if (!["data-rt-mention", "data-id", "contenteditable"].includes(attr.name)) {
            span.removeAttribute(attr.name);
          }
        }
        span.setAttribute("contenteditable", "false");
      } else {
        span.replaceWith(...span.childNodes);
      }
    }

    for (const link of fragment.querySelectorAll("a[href]")) {
      const href = link.getAttribute("href") ?? "";
      if (/^\s*javascript:/i.test(href) || /^\s*data:/i.test(href)) {
        link.removeAttribute("href");
      }
    }

    return fragment;
  };
}
