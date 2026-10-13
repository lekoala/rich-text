import { RichText } from "./rich-text.js";

/** @typedef {import("./rich-text.js").RichTextOptions} RichTextOptions */

/**
 * Declarative lifecycle owner for a textarea-backed RichText instance.
 * The child textarea always remains the native form-value owner.
 */
export class RichTextElement extends HTMLElement {
  static get observedAttributes() {
    return ["toolbar"];
  }

  constructor() {
    super();
    /** @type {RichText | null} */
    this._richText = null;
    /** @type {RichTextOptions} */
    this._options = {};
    /** @type {MutationObserver | null} */
    this._sourceObserver = null;
    this._revision = 0;
    this._rebuildQueued = false;
    /** @type {Array<(richText: RichText) => void>} */
    this._readyResolvers = [];
    this.#upgradeProperty("options");
  }

  connectedCallback() {
    const revision = ++this._revision;
    queueMicrotask(() => {
      if (revision !== this._revision || !this.isConnected) return;
      this.upgrade();
    });
  }

  disconnectedCallback() {
    const revision = ++this._revision;
    queueMicrotask(() => {
      if (revision !== this._revision || this.isConnected) return;
      this.dispose();
    });
  }

  /**
   * @param {string} _name
   * @param {string | null} oldValue
   * @param {string | null} newValue
   */
  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue || !this._richText) return;
    this.#scheduleRebuild();
  }

  /** @returns {HTMLTextAreaElement | null} */
  get source() {
    return this._richText?.source ?? this.#findSource();
  }

  /** @returns {RichText | null} */
  get richText() {
    return this._richText;
  }

  /** @returns {RichTextOptions} */
  get options() {
    return { ...this._options };
  }

  /** @param {RichTextOptions} value */
  set options(value) {
    if (value == null) value = {};
    if (typeof value !== "object") throw new TypeError("rich-text options must be an object");
    this._options = { ...value };
    if (this._richText) this.#scheduleRebuild();
  }

  /** @param {RichTextOptions} [options] @returns {this} */
  configure(options = {}) {
    this.options = { ...this._options, ...options };
    return this;
  }

  /** @returns {RichText | null} */
  upgrade() {
    this.#watchSource();
    const source = this.#findSource();
    if (!source) {
      // The textarea was removed (e.g. a framework re-render): drop the editor until a new one appears.
      this._richText?.dispose();
      this._richText = null;
      return null;
    }

    // Same textarea, possibly moved to another form/fieldset: re-read its document context.
    if (this._richText?.source === source) return this._richText.refresh();
    this._richText?.dispose();

    this._richText = new RichText(source, this.#resolvedOptions());

    const ready = this._readyResolvers.splice(0);
    for (const resolve of ready) resolve(this._richText);

    this.dispatchEvent(
      new CustomEvent("richtext:ready", {
        bubbles: true,
        detail: { richText: this._richText, source },
      }),
    );
    return this._richText;
  }

  /** @returns {Promise<RichText>} */
  whenReady() {
    if (this._richText) return Promise.resolve(this._richText);
    return new Promise((resolve) => this._readyResolvers.push(resolve));
  }

  dispose() {
    this._sourceObserver?.disconnect();
    this._sourceObserver = null;
    this._richText?.dispose();
    this._richText = null;
  }

  #findSource() {
    for (const child of this.children) {
      if (child instanceof HTMLTextAreaElement) return child;
    }
    return null;
  }

  /** Rebind whenever the child textarea appears, disappears or is replaced. */
  #watchSource() {
    if (this._sourceObserver) return;
    this._sourceObserver = new MutationObserver(() => {
      if (this.isConnected && this.#findSource() !== this._richText?.source) this.upgrade();
    });
    this._sourceObserver.observe(this, { childList: true });
  }

  #resolvedOptions() {
    const attrs = {};
    if (this.hasAttribute("toolbar")) attrs.toolbar = this.getAttribute("toolbar") ?? undefined;
    return { ...attrs, ...this._options };
  }

  #scheduleRebuild() {
    if (this._rebuildQueued) return;
    this._rebuildQueued = true;
    queueMicrotask(() => {
      this._rebuildQueued = false;
      if (!this.isConnected || !this._richText) return;
      const previous = this._richText;
      const active = this.ownerDocument.activeElement;
      const focused = Boolean(active && previous.shell.contains(active));
      const command = active instanceof HTMLElement ? active.dataset.command : null;
      const range = focused ? previous.squire.getSelection() : null;
      const start = range ? selectionPath(range.startContainer, previous.surface) : null;
      const end = range ? selectionPath(range.endContainer, previous.surface) : null;
      const startOffset = range?.startOffset ?? 0;
      const endOffset = range?.endOffset ?? 0;
      previous.dispose();
      this._richText = null;
      const next = this.upgrade();
      if (!focused || !next || next.disabled) return;
      next.focus();
      if (start && end) {
        const startNode = selectionNode(start, next.surface);
        const endNode = selectionNode(end, next.surface);
        if (startNode && endNode) {
          const restored = this.ownerDocument.createRange();
          restored.setStart(startNode, Math.min(startOffset, nodeLength(startNode)));
          restored.setEnd(endNode, Math.min(endOffset, nodeLength(endNode)));
          next.squire.setSelection(restored);
        }
      }
      if (command) {
        const button = [...next.toolbar.querySelectorAll("button")].find(
          (button) => button.dataset.command === command && !button.disabled,
        );
        button?.focus();
      }
    });
  }

  /** @param {string} name */
  #upgradeProperty(name) {
    if (!Object.hasOwn(this, name)) return;
    const value = Reflect.get(this, name);
    Reflect.deleteProperty(this, name);
    Reflect.set(this, name, value);
  }
}

/**
 * Register the official <rich-text> element once.
 * @returns {typeof RichTextElement}
 */
export function defineRichText() {
  if (!customElements.get("rich-text")) customElements.define("rich-text", RichTextElement);
  return RichTextElement;
}

/** @param {Node} node @param {Node} root @returns {number[] | null} */
function selectionPath(node, root) {
  const path = [];
  while (node !== root) {
    const parent = node.parentNode;
    if (!parent) return null;
    path.unshift([...parent.childNodes].indexOf(/** @type {ChildNode} */ (node)));
    node = parent;
  }
  return path;
}

/** @param {number[]} path @param {Node} root @returns {Node | null} */
function selectionNode(path, root) {
  let node = root;
  for (const index of path) {
    if (!node.childNodes[index]) return null;
    node = node.childNodes[index];
  }
  return node;
}

/** @param {Node} node */
function nodeLength(node) {
  return node.nodeType === 3 ? (node.textContent?.length ?? 0) : node.childNodes.length;
}
