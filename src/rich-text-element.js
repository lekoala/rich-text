import { RichText } from "./rich-text.js";
import { normalizeToolbar } from "./helpers.js";

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
    /** @type {HTMLTextAreaElement | null} */
    this._source = null;
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
    return this._source || this.#findSource();
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
    const source = this.#findSource();
    if (!source) {
      this.#watchForSource();
      return null;
    }

    this._sourceObserver?.disconnect();
    this._sourceObserver = null;

    if (this._richText && this._source === source) return this._richText;
    this._richText?.dispose();

    this._source = source;
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
    this._source = null;
  }

  #findSource() {
    for (const child of this.children) {
      if (child instanceof HTMLTextAreaElement) return child;
    }
    return null;
  }

  #watchForSource() {
    if (this._sourceObserver) return;
    this._sourceObserver = new MutationObserver(() => {
      if (this.#findSource()) this.upgrade();
    });
    this._sourceObserver.observe(this, { childList: true });
  }

  #resolvedOptions() {
    const attrs = {};
    if (this.hasAttribute("toolbar")) attrs.toolbar = normalizeToolbar(this.getAttribute("toolbar"));
    return { ...attrs, ...this._options };
  }

  #scheduleRebuild() {
    if (this._rebuildQueued) return;
    this._rebuildQueued = true;
    queueMicrotask(() => {
      this._rebuildQueued = false;
      if (!this.isConnected || !this._richText) return;
      const source = this._source;
      this._richText.dispose();
      this._richText = null;
      this._source = source;
      this.upgrade();
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
