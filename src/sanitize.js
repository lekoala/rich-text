import DOMPurify from "dompurify";
import { isSafeHref } from "./helpers.js";

/*
 * Internal module: the policy is the component's contract, not a public API. It is intentionally not
 * configurable or replaceable, so that no integration can open a bypass around it.
 */

const ALLOWED_TAGS = ["p", "br", "b", "strong", "i", "em", "ul", "ol", "li", "blockquote", "a", "span"];
const ALLOWED_ATTRIBUTES = ["href", "title", "data-rt-mention", "data-id", "contenteditable"];

/** Attributes that only carry meaning on a structured mention span. */
const MENTION_ATTRIBUTES = ["data-rt-mention", "data-id", "contenteditable"];

/** Block wrappers outside the vocabulary: they become paragraphs, or are unwrapped when they hold blocks. */
const CONTAINERS =
  "div, section, article, header, footer, main, aside, nav, address, figure, figcaption, center, details, " +
  "summary, dl, dt, dd, table, thead, tbody, tfoot, tr, h1, h2, h3, h4, h5, h6, pre";
const BLOCKS = "p, ul, ol, li, blockquote";

/**
 * Map what the vocabulary can express before the strict pass removes it: clipboards from Google Docs, Word,
 * web pages and chat apps carry structure as styles, headings, divs and tables.
 * @param {HTMLElement} root an element of DOMPurify's inert document
 */
function normalizeMarkup(root) {
  const doc = root.ownerDocument;
  for (const br of root.querySelectorAll("br.Apple-interchange-newline")) br.remove();
  convertWordLists(root);
  applyInlineStyles(root);

  // One paragraph per table row, cells separated by a space.
  for (const cell of [...root.querySelectorAll("td, th")]) {
    if (cell.nextElementSibling) cell.append(" ");
    cell.replaceWith(...cell.childNodes);
  }

  // Deepest first, so a wrapper sees its already converted children.
  for (const element of [...root.querySelectorAll(CONTAINERS)].reverse()) {
    if (element.localName === "pre") preserveLineBreaks(element);
    if (element.querySelector(BLOCKS)) {
      element.replaceWith(...element.childNodes);
      continue;
    }
    const paragraph = doc.createElement("p");
    if (/^h[1-6]$/.test(element.localName) && !element.querySelector("b, strong")) {
      const bold = doc.createElement("b");
      bold.append(...element.childNodes);
      paragraph.append(bold);
    } else {
      paragraph.append(...element.childNodes);
    }
    element.replaceWith(paragraph);
  }

  // Google Docs wraps each list item's text in a paragraph: keep list items as the toolbar makes them.
  for (const item of root.querySelectorAll("li")) {
    const blocks = [...item.children].filter((child) => child.matches(BLOCKS));
    if (blocks.length === 1 && blocks[0].localName === "p") blocks[0].replaceWith(...blocks[0].childNodes);
  }

  wrapLooseInline(root);
}

/**
 * Squire wraps loose top-level inline content in a hard-coded DIV, whatever its `blockTag`. When the fragment
 * is made of lines or blocks, wrap each loose run in a paragraph first; an inline-only fragment stays inline
 * so that it is inserted into the current paragraph.
 * @param {HTMLElement} root
 */
function wrapLooseInline(root) {
  const doc = root.ownerDocument;
  const nodes = [...root.childNodes];
  if (!nodes.some((node) => node.nodeName === "BR" || isBlock(node))) return;
  /** @type {HTMLElement | null} */
  let paragraph = null;
  for (const node of nodes) {
    if (node.nodeName === "BR" || isBlock(node)) {
      if (node.nodeName === "BR") node.remove();
      paragraph = null;
      continue;
    }
    if (!paragraph) {
      if (node.nodeType === 3 && !node.textContent?.trim()) continue;
      paragraph = doc.createElement("p");
      node.before(paragraph);
    }
    paragraph.append(node);
  }
}

/** @param {Node} node */
function isBlock(node) {
  return node.nodeType === 1 && /** @type {Element} */ (node).matches(BLOCKS);
}

/**
 * Bold/italic expressed as styles (Google Docs spans, `<b style="font-weight:normal">` wrappers) become tags.
 * @param {HTMLElement} root
 */
function applyInlineStyles(root) {
  for (const element of /** @type {HTMLElement[]} */ ([...root.querySelectorAll("[style]")])) {
    // DOMPurify's inert document has no window, so no instanceof: every styled element here has `style`.
    if (!element.style || element.hasAttribute("data-rt-mention")) continue;
    const { fontWeight, fontStyle } = element.style;
    const weight =
      { bold: 700, bolder: 700, normal: 400, lighter: 400 }[fontWeight] ?? Number.parseInt(fontWeight, 10);
    const name = element.localName;
    const boldTag = name === "b" || name === "strong";
    const italicTag = name === "i" || name === "em";
    const wraps =
      !element.matches("ul, ol, table, thead, tbody, tfoot, tr") && !element.querySelector(BLOCKS);

    if (wraps && weight >= 600 && !boldTag && !element.closest("b, strong")) wrapChildren(element, "b");
    if (wraps && /italic|oblique/.test(fontStyle) && !italicTag && !element.closest("i, em")) {
      wrapChildren(element, "i");
    }
    if ((boldTag && weight < 600) || (italicTag && fontStyle === "normal"))
      element.replaceWith(...element.childNodes);
  }
}

/**
 * Word (desktop) exports lists as paragraphs with an `mso-list` style and a typed marker: rebuild flat lists.
 * @param {HTMLElement} root
 */
function convertWordLists(root) {
  const doc = root.ownerDocument;
  /** @type {HTMLElement | null} */
  let list = null;
  for (const item of [...root.querySelectorAll("p")]) {
    if (!/mso-list:\s*l\d/i.test(item.getAttribute("style") ?? "")) continue;
    const marker = item.querySelector('[style*="mso-list:ignore" i]');
    const tag = /^\s*\w{1,4}[.)]/.test(marker?.textContent ?? "") ? "ol" : "ul";
    marker?.remove();
    if (!list || item.previousElementSibling !== list || list.localName !== tag) {
      list = doc.createElement(tag);
      item.before(list);
    }
    const entry = doc.createElement("li");
    entry.append(...item.childNodes);
    list.append(entry);
    item.remove();
  }
}

/** @param {Element} element */
function preserveLineBreaks(element) {
  const doc = element.ownerDocument;
  const walker = doc.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(/** @type {Text} */ (node));
  for (const text of texts) {
    const lines = text.data.replace(/\n$/, "").split("\n");
    if (lines.length < 2) continue;
    text.replaceWith(...lines.flatMap((line, index) => (index ? [doc.createElement("br"), line] : [line])));
  }
}

/** @param {Element} element @param {string} tag */
function wrapChildren(element, tag) {
  const wrapper = element.ownerDocument.createElement(tag);
  wrapper.append(...element.childNodes);
  element.append(wrapper);
}

/**
 * The mandatory Squire HTML sanitizer (Squire's `sanitizeToDOMFragment` hook).
 * - A first, default DOMPurify pass removes anything active; the result is normalised to the vocabulary
 *   (`normalizeMarkup`) inside DOMPurify's inert document, then the strict pass below applies the policy.
 * - `span` is only retained for structured mentions; other spans are unwrapped. A mention label is plain text.
 * - Mention attributes are removed from every other element (a stray `contenteditable` could otherwise
 *   re-enable editing inside a readonly editor, or create non-mention atomic islands).
 * - Links follow the same policy as the toolbar (`isSafeHref`); a link with a missing or refused href is
 *   unwrapped to its text.
 * @param {string} html
 * @param {import("squire-rte").default} editor
 * @returns {DocumentFragment}
 */
export function sanitizeToDOMFragment(html, editor) {
  const doc = editor.getRoot().ownerDocument;
  const loose = /** @type {HTMLElement} */ (DOMPurify.sanitize(html, { RETURN_DOM: true }));
  normalizeMarkup(loose);
  const sanitized = /** @type {DocumentFragment} */ (
    DOMPurify.sanitize(loose.innerHTML, {
      ALLOWED_TAGS,
      ALLOWED_ATTR: ALLOWED_ATTRIBUTES,
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
}
