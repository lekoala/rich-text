import Squire from "squire-rte";
import { autoUpdate, repositionAt } from "@lekoala/floating";
import {
  DEFAULT_TOOLBAR,
  isEditorEmpty,
  isSafeHref,
  matchSuggestionText,
  mentionFromElement,
  normalizeToolbar,
} from "./helpers.js";
import { createSanitizeToDOMFragment } from "./sanitize.js";

/**
 * @typedef {Object} MentionInsert
 * @property {"mention"} type
 * @property {string} id
 * @property {string} label
 * @property {string} [mentionType]
 *
 * @typedef {Object} TextInsert
 * @property {"text"} type
 * @property {string} text
 *
 * @typedef {Object} HtmlInsert
 * @property {"html"} type
 * @property {string} html
 *
 * @typedef {MentionInsert | TextInsert | HtmlInsert} SuggestionInsert
 *
 * @typedef {Object} SuggestionContext
 * @property {string} trigger
 * @property {string} query
 * @property {AbortSignal} signal
 * @property {RichText} richText
 *
 * @typedef {Object} SuggestionProvider
 * @property {string} trigger
 * @property {number} [minChars]
 * @property {"mention" | "generic"} [kind]
 * @property {string} [mentionType]
 * @property {(query: string, context: SuggestionContext) => any[] | Promise<any[]>} search
 * @property {(item: any) => string} [getLabel]
 * @property {(item: any) => string} [getId]
 * @property {(item: any, context: SuggestionContext) => Node} [renderItem]
 * @property {(item: any, context: SuggestionContext) => SuggestionInsert} [insert]
 *
 * @typedef {SuggestionContext & { range: Range }} ActiveSuggestionContext
 *
 * @typedef {Object} RichTextOptions
 * @property {string[] | string} [toolbar]
 * @property {SuggestionProvider[]} [suggestions]
 * @property {(html: string, editor: Squire) => DocumentFragment} [sanitizeToDOMFragment]
 * @property {(context: { href: string, text: string, richText: RichText }) => string | null | Promise<string | null>} [requestLink]
 */

/** @type {Record<string, { label: string, text: string, toggle?: string }>} */
const BUTTONS = {
  bold: { label: "Bold", text: "B", toggle: "B" },
  italic: { label: "Italic", text: "I", toggle: "I" },
  "bullet-list": { label: "Bulleted list", text: "•", toggle: "UL" },
  "ordered-list": { label: "Numbered list", text: "1.", toggle: "OL" },
  link: { label: "Link", text: "↗", toggle: "A" },
  blockquote: { label: "Quote", text: "❝", toggle: "BLOCKQUOTE" },
  undo: { label: "Undo", text: "↶" },
  redo: { label: "Redo", text: "↷" },
};

let uid = 0;

/**
 * Small, opinionated Squire adapter. The supplied textarea remains the form-value owner.
 */
export class RichText {
  /**
   * @param {HTMLTextAreaElement} source
   * @param {RichTextOptions} [options]
   */
  constructor(source, options = {}) {
    if (!(source instanceof HTMLTextAreaElement)) {
      throw new TypeError("RichText requires a textarea source.");
    }

    this.source = source;
    /** @type {{
     * toolbar: string[],
     * suggestions: SuggestionProvider[],
     * sanitizeToDOMFragment: (html: string, editor: Squire) => DocumentFragment,
     * requestLink: (context: { href: string, text: string, richText: RichText }) => string | null | Promise<string | null>
     * }} */
    this.options = {
      toolbar: normalizeToolbar(options.toolbar),
      suggestions: options.suggestions ?? [],
      sanitizeToDOMFragment: options.sanitizeToDOMFragment ?? createSanitizeToDOMFragment(),
      requestLink: options.requestLink ?? defaultLinkRequest,
    };

    this._controller = new AbortController();
    this._sourceWasHidden = source.hasAttribute("hidden");
    /** @type {{ label: HTMLLabelElement, id: string }[]} */
    this._generatedLabelIds = [];
    this._dispatchingSource = false;
    this._settingEditor = false;
    this._focusValue = source.value;
    this._canUndo = false;
    this._canRedo = false;
    this._composing = false;
    /** @type {AbortController | null} */
    this._suggestionAbort = null;
    this._suggestionRevision = 0;
    /** @type {ActiveSuggestionContext | null} */
    this._suggestionContext = null;
    /** @type {any[]} */
    this._suggestionItems = [];
    /** @type {SuggestionProvider | null} */
    this._suggestionProvider = null;
    this._activeSuggestion = 0;
    /** @type {(() => void) | null} */
    this._stopSuggestionAutoUpdate = null;

    this.shell = source.ownerDocument.createElement("div");
    this.shell.className = "rt-shell";

    this.toolbar = source.ownerDocument.createElement("div");
    this.toolbar.className = "rt-toolbar";
    this.toolbar.setAttribute("role", "toolbar");
    this.toolbar.setAttribute("aria-label", "Formatting");

    this.surface = source.ownerDocument.createElement("div");
    this.surface.className = "rt-editor";
    this.surface.setAttribute("role", "textbox");
    this.surface.setAttribute("aria-multiline", "true");

    this.shell.append(this.toolbar, this.surface);
    source.after(this.shell);
    source.hidden = true;

    this._buildToolbar();
    this._copyAccessibility();

    /** @type {Squire} */
    this.squire = new Squire(this.surface, {
      blockTag: "P",
      sanitizeToDOMFragment: this.options.sanitizeToDOMFragment,
    });

    this.suggestionPopup = this._createSuggestionPopup();
    this._bind();
    this._setEditorHTML(source.value);
    this._syncEditableState();
  }

  /** @returns {string} */
  get value() {
    return this.source.value;
  }

  /** @returns {boolean} */
  get editable() {
    return !this.source.disabled && !this.source.readOnly;
  }

  focus() {
    this.squire.focus();
  }

  /** Pull an externally changed textarea value into Squire. */
  sync() {
    this._setEditorHTML(this.source.value);
    this._syncEditableState();
    return this;
  }

  /**
   * @param {string} html
   * @returns {this}
   */
  setHTML(html) {
    this._setEditorHTML(html);
    return this;
  }

  /** @returns {string} */
  getHTML() {
    return this.source.value;
  }

  /**
   * Mentions in document order. Duplicates are preserved intentionally.
   * @returns {{ type: string, id: string, label: string }[]}
   */
  getMentions() {
    /** @type {{ type: string, id: string, label: string }[]} */
    const mentions = [];
    for (const element of this.surface.querySelectorAll("[data-rt-mention]")) {
      const mention = mentionFromElement(element);
      if (mention) mentions.push(mention);
    }
    return mentions;
  }

  /**
   * Insert a structured, atomic mention at the current selection.
   * @param {{ id: string, label: string, type?: string }} mention
   * @returns {this}
   */
  insertMention(mention) {
    const range = this.squire.getSelection();
    this._insertMention(mention, range);
    return this;
  }

  /** Tear down generated UI and restore the source textarea. */
  dispose() {
    this._suggestionAbort?.abort();
    this._stopSuggestionAutoUpdate?.();
    this._controller.abort();
    this.squire.destroy();
    this.suggestionPopup.remove();
    this.shell.remove();

    for (const { label, id } of this._generatedLabelIds) {
      if (label.id === id) label.removeAttribute("id");
    }
    this._generatedLabelIds = [];

    if (this._sourceWasHidden) this.source.setAttribute("hidden", "");
    else this.source.removeAttribute("hidden");
  }

  _bind() {
    const signal = this._controller.signal;

    this.squire.addEventListener("input", () => {
      if (this._settingEditor) return;
      this._syncFromEditor(true);
      if (!this._composing) this._updateSuggestion();
    });
    this.squire.addEventListener("pathChange", () => this._updateToolbarState());
    this.squire.addEventListener("cursor", () => {
      this._updateToolbarState();
      if (!this._composing) this._updateSuggestion();
    });
    this.squire.addEventListener("select", () => {
      this._updateToolbarState();
      this._closeSuggestions();
    });
    this.squire.addEventListener("undoStateChange", (event) => {
      const detail =
        /** @type {CustomEvent<{ canUndo?: boolean, canRedo?: boolean }>} */ (event).detail;
      this._canUndo = Boolean(detail?.canUndo);
      this._canRedo = Boolean(detail?.canRedo);
      this._updateToolbarState();
    });
    this.squire.addEventListener("pasteImage", (event) => {
      event.preventDefault?.();
    });

    this.surface.addEventListener("keydown", (event) => this._onEditorKeydown(event), {
      capture: true,
      signal,
    });
    this.surface.addEventListener(
      "compositionstart",
      () => {
        this._composing = true;
        this._closeSuggestions();
      },
      { signal },
    );
    this.surface.addEventListener(
      "compositionend",
      () => {
        this._composing = false;
        queueMicrotask(() => this._updateSuggestion());
      },
      { signal },
    );

    this.toolbar.addEventListener("click", (event) => this._onToolbarClick(event), { signal });
    this.toolbar.addEventListener("keydown", (event) => this._onToolbarKeydown(event), { signal });
    this.toolbar.addEventListener("focusin", (event) => this._rememberToolbarButton(event.target), { signal });

    this.shell.addEventListener(
      "focusin",
      (event) => {
        const previous = event.relatedTarget;
        if (!(previous instanceof Node) || !this.shell.contains(previous)) {
          this._focusValue = this.source.value;
        }
        if (event.target !== this.surface && !this.surface.contains(/** @type {Node} */ (event.target))) {
          this._closeSuggestions();
        }
      },
      { signal },
    );
    this.shell.addEventListener(
      "focusout",
      () => {
        queueMicrotask(() => {
          const active = this.source.ownerDocument.activeElement;
          if (active && this.shell.contains(active)) return;
          this._closeSuggestions();
          if (this.source.value !== this._focusValue) this._dispatchSource("change");
        });
      },
      { signal },
    );

    this.source.addEventListener(
      "input",
      () => {
        if (!this._dispatchingSource) this.sync();
      },
      { signal },
    );
    this.source.addEventListener(
      "change",
      () => {
        if (!this._dispatchingSource) this.sync();
      },
      { signal },
    );
    this.source.addEventListener(
      "invalid",
      (event) => {
        event.preventDefault();
        this.focus();
        this.source.dispatchEvent(
          new CustomEvent("richtext:invalid", { bubbles: true, detail: { richText: this } }),
        );
      },
      { signal },
    );

    const form = this.source.form;
    form?.addEventListener(
      "reset",
      (event) => {
        if (event.defaultPrevented) return;
        queueMicrotask(() => this.sync());
      },
      { signal },
    );

    for (const label of this.source.labels ?? []) {
      label.addEventListener(
        "click",
        (event) => {
          if (event.defaultPrevented || !this.editable) return;
          queueMicrotask(() => this.focus());
        },
        { signal },
      );
    }

    /** @type {MutationObserver} */
    this._sourceObserver = new MutationObserver(() => {
      this._syncEditableState();
      this._copyAccessibility();
    });
    this._sourceObserver.observe(this.source, {
      attributes: true,
      attributeFilter: [
        "disabled",
        "readonly",
        "required",
        "aria-invalid",
        "aria-describedby",
        "aria-label",
        "placeholder",
        "spellcheck",
        "autocapitalize",
      ],
    });
    signal.addEventListener("abort", () => this._sourceObserver?.disconnect(), { once: true });

    this.source.ownerDocument.addEventListener(
      "pointerdown",
      (event) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (!this.shell.contains(target) && !this.suggestionPopup.contains(target)) this._closeSuggestions();
      },
      { capture: true, signal },
    );
  }

  _buildToolbar() {
    this.toolbar.replaceChildren();
    const commands = this.options.toolbar ?? DEFAULT_TOOLBAR;
    for (const command of commands) {
      const config = BUTTONS[command];
      if (!config) continue;
      const button = this.source.ownerDocument.createElement("button");
      button.type = "button";
      button.className = "rt-button";
      button.dataset.command = command;
      button.setAttribute("aria-label", config.label);
      button.title = config.label;
      button.textContent = config.text;
      if (config.toggle) button.setAttribute("aria-pressed", "false");
      this.toolbar.append(button);
    }
    this.toolbar.hidden = !this.toolbar.children.length;
    this._syncToolbarTabStops();
  }

  /** @param {HTMLButtonElement | null} [preferred] */
  _syncToolbarTabStops(preferred = null) {
    const buttons = [...this.toolbar.querySelectorAll("button:not(:disabled)")].filter(
      (button) => button instanceof HTMLButtonElement,
    );
    const target = preferred && buttons.includes(preferred) ? preferred : buttons[0] ?? null;
    for (const button of buttons) button.tabIndex = button === target ? 0 : -1;
  }

  /** @param {EventTarget | null} target */
  _rememberToolbarButton(target) {
    if (target instanceof HTMLButtonElement && this.toolbar.contains(target)) {
      this._syncToolbarTabStops(target);
    }
  }

  /** @param {KeyboardEvent} event */
  _onToolbarKeydown(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const buttons = [...this.toolbar.querySelectorAll("button:not(:disabled)")].filter(
      (button) => button instanceof HTMLButtonElement,
    );
    const current = event.target;
    if (!(current instanceof HTMLButtonElement) || !buttons.includes(current)) return;

    let index = buttons.indexOf(current);
    if (event.key === "Home") index = 0;
    else if (event.key === "End") index = buttons.length - 1;
    else {
      const rtl = getComputedStyle(this.toolbar).direction === "rtl";
      const delta = event.key === "ArrowRight" ? (rtl ? -1 : 1) : rtl ? 1 : -1;
      index = (index + delta + buttons.length) % buttons.length;
    }

    event.preventDefault();
    this._syncToolbarTabStops(buttons[index]);
    buttons[index].focus();
  }

  /** @param {MouseEvent} event */
  async _onToolbarClick(event) {
    const button = event.target instanceof Element ? event.target.closest("button[data-command]") : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled || !this.editable) return;
    await this._executeCommand(button.dataset.command ?? "");
    this._updateToolbarState();
  }

  /** @param {string} command */
  async _executeCommand(command) {
    const editor = this.squire;
    switch (command) {
      case "bold":
        editor.hasFormat("B") ? editor.removeBold() : editor.bold();
        break;
      case "italic":
        editor.hasFormat("I") ? editor.removeItalic() : editor.italic();
        break;
      case "bullet-list":
        editor.hasFormat("UL") ? editor.removeList() : editor.makeUnorderedList();
        break;
      case "ordered-list":
        editor.hasFormat("OL") ? editor.removeList() : editor.makeOrderedList();
        break;
      case "blockquote":
        editor.hasFormat("BLOCKQUOTE") ? editor.removeQuote() : editor.increaseQuoteLevel();
        break;
      case "link":
        await this._toggleLink();
        return;
      case "undo":
        editor.undo();
        break;
      case "redo":
        editor.redo();
        break;
      default:
        return;
    }
    editor.focus();
  }

  async _toggleLink() {
    const editor = this.squire;
    const range = editor.getSelection();
    let node = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const link = node?.closest?.("a") ?? null;
    const href = link?.getAttribute("href") ?? "";
    const text = editor.getSelectedText();
    const next = await this.options.requestLink({ href, text, richText: this });
    if (next == null) return;
    if (!next.trim()) {
      editor.removeLink();
      editor.focus();
      return;
    }
    if (!isSafeHref(next)) {
      this.source.dispatchEvent(
        new CustomEvent("richtext:linkerror", {
          bubbles: true,
          detail: { href: next },
        }),
      );
      return;
    }
    editor.makeLink(next.trim());
    editor.focus();
  }

  _updateToolbarState() {
    /** @type {NodeListOf<HTMLButtonElement>} */
    const buttons = this.toolbar.querySelectorAll("button[data-command]");
    for (const button of buttons) {
      const command = button.dataset.command ?? "";
      const config = BUTTONS[command];
      if (config?.toggle) button.setAttribute("aria-pressed", String(this.squire.hasFormat(config.toggle)));
      if (command === "undo") button.disabled = !this._canUndo || !this.editable;
      else if (command === "redo") button.disabled = !this._canRedo || !this.editable;
      else button.disabled = !this.editable;
    }
    this._syncToolbarTabStops();
  }

  /** @param {string} html */
  _setEditorHTML(html) {
    this._settingEditor = true;
    try {
      this.squire.setHTML(String(html ?? ""));
      this._syncFromEditor(false);
    } finally {
      this._settingEditor = false;
    }
  }

  /** @param {boolean} dispatchInput */
  _syncFromEditor(dispatchInput) {
    const html = isEditorEmpty(this.surface) ? "" : this.squire.getHTML();
    const changed = this.source.value !== html;
    this.source.value = html;
    this.surface.dataset.empty = String(!html);
    if (changed && dispatchInput) this._dispatchSource("input");
  }

  /** @param {string} type */
  _dispatchSource(type) {
    this._dispatchingSource = true;
    try {
      this.source.dispatchEvent(new Event(type, { bubbles: true }));
    } finally {
      this._dispatchingSource = false;
    }
  }

  _copyAccessibility() {
    const source = this.source;
    const labelledBy = [];

    for (const label of source.labels ?? []) {
      if (!label.id) {
        const id = `rt-label-${++uid}`;
        label.id = id;
        this._generatedLabelIds.push({ label, id });
      }
      labelledBy.push(label.id);
    }

    const explicitLabel = source.getAttribute("aria-label");
    if (explicitLabel) this.surface.setAttribute("aria-label", explicitLabel);
    else this.surface.removeAttribute("aria-label");

    if (labelledBy.length) this.surface.setAttribute("aria-labelledby", labelledBy.join(" "));
    else this.surface.removeAttribute("aria-labelledby");

    copyAttribute(source, this.surface, "aria-describedby");
    copyAttribute(source, this.surface, "aria-invalid");
    this.surface.setAttribute("aria-required", String(source.required));
    this.surface.spellcheck = source.spellcheck;
    const autocapitalize = source.getAttribute("autocapitalize");
    if (autocapitalize == null) this.surface.removeAttribute("autocapitalize");
    else this.surface.setAttribute("autocapitalize", autocapitalize);
    this.surface.dataset.placeholder = source.placeholder || "";
  }

  _syncEditableState() {
    const editable = this.editable;
    this.surface.setAttribute("contenteditable", String(editable));
    this.surface.tabIndex = this.source.disabled ? -1 : 0;
    this.surface.setAttribute("aria-disabled", String(this.source.disabled));
    this.surface.setAttribute("aria-readonly", String(this.source.readOnly));
    this.shell.toggleAttribute("data-disabled", this.source.disabled);
    this.shell.toggleAttribute("data-readonly", this.source.readOnly);
    this._updateToolbarState();
  }

  /** @returns {HTMLDivElement} */
  _createSuggestionPopup() {
    const doc = this.source.ownerDocument;
    const popup = doc.createElement("div");
    popup.className = "rt-suggestions";
    popup.id = `rt-suggestions-${++uid}`;
    popup.setAttribute("role", "listbox");
    popup.hidden = true;
    if ("showPopover" in popup) popup.setAttribute("popover", "manual");
    doc.body.append(popup);

    this.surface.setAttribute("aria-autocomplete", "list");
    this.surface.setAttribute("aria-haspopup", "listbox");
    this.surface.setAttribute("aria-controls", popup.id);
    this.surface.setAttribute("aria-expanded", "false");

    popup.addEventListener(
      "pointerdown",
      (event) => {
        const option = event.target instanceof Element ? event.target.closest("[role=option]") : null;
        if (!(option instanceof HTMLElement)) return;
        event.preventDefault();
        const index = Number(option.dataset.index);
        if (Number.isInteger(index)) this._selectSuggestion(index);
      },
      { signal: this._controller.signal },
    );
    return popup;
  }

  /** @param {KeyboardEvent} event */
  _onEditorKeydown(event) {
    if (event.isComposing) return;

    if (this._suggestionItems.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const delta = event.key === "ArrowDown" ? 1 : -1;
        this._setActiveSuggestion(
          (this._activeSuggestion + delta + this._suggestionItems.length) % this._suggestionItems.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        this._selectSuggestion(this._activeSuggestion);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        this._closeSuggestions();
        return;
      }
    }

    if ((event.key === "Backspace" || event.key === "Delete") && this._removeAdjacentMention(event.key)) {
      event.preventDefault();
    }
  }

  /** @param {string} key @returns {boolean} */
  _removeAdjacentMention(key) {
    const range = this.squire.getSelection();
    if (!range.collapsed) return false;
    const mention = adjacentMention(range, key === "Backspace" ? -1 : 1, this.surface);
    if (!mention) return false;

    const parent = mention.parentNode;
    if (!parent) return false;
    const index = [...parent.childNodes].indexOf(mention);
    this.squire.saveUndoState(range.cloneRange());
    const detail = mentionFromElement(mention);
    mention.remove();

    const next = this.source.ownerDocument.createRange();
    next.setStart(parent, Math.max(0, Math.min(index, parent.childNodes.length)));
    next.collapse(true);
    this.squire.setSelection(next);
    this.squire.focus();
    queueMicrotask(() => this._syncFromEditor(true));
    this.source.dispatchEvent(
      new CustomEvent("richtext:mentionremove", { bubbles: true, detail }),
    );
    return true;
  }

  async _updateSuggestion() {
    const providers = this.options.suggestions ?? [];
    if (!providers.length || this._composing || !this.editable) {
      this._closeSuggestions();
      return;
    }

    const range = this.squire.getSelection();
    if (!range.collapsed || !(range.startContainer instanceof Text)) {
      this._closeSuggestions();
      return;
    }

    const textBeforeCaret = range.startContainer.data.slice(0, range.startOffset);
    const match = matchSuggestionText(textBeforeCaret, providers.map((provider) => provider.trigger));
    if (!match) {
      this._closeSuggestions();
      return;
    }

    const provider = providers.find((entry) => entry.trigger === match.trigger);
    if (!provider || match.query.length < (provider.minChars ?? 0)) {
      this._closeSuggestions();
      return;
    }

    const replaceRange = this.source.ownerDocument.createRange();
    replaceRange.setStart(range.startContainer, match.start);
    replaceRange.setEnd(range.startContainer, range.startOffset);

    const revision = ++this._suggestionRevision;
    this._suggestionAbort?.abort();
    const controller = new AbortController();
    this._suggestionAbort = controller;
    const context = {
      trigger: match.trigger,
      query: match.query,
      signal: controller.signal,
      richText: this,
    };

    try {
      const items = await provider.search(match.query, context);
      if (controller.signal.aborted || revision !== this._suggestionRevision) return;
      if (!Array.isArray(items) || !items.length) {
        this._closeSuggestions();
        return;
      }
      this._suggestionContext = { ...context, range: replaceRange };
      this._suggestionItems = items;
      this._suggestionProvider = provider;
      this._activeSuggestion = 0;
      this._renderSuggestions();
    } catch (error) {
      if (controller.signal.aborted) return;
      this._closeSuggestions();
      this.source.dispatchEvent(
        new CustomEvent("richtext:suggestionerror", { bubbles: true, detail: { error, provider } }),
      );
    }
  }

  _renderSuggestions() {
    const provider = this._suggestionProvider;
    const context = this._suggestionContext;
    if (!provider || !context) return;

    this.suggestionPopup.replaceChildren();
    this._suggestionItems.forEach((item, index) => {
      const option = this.source.ownerDocument.createElement("div");
      option.className = "rt-suggestion";
      option.id = `${this.suggestionPopup.id}-option-${index}`;
      option.dataset.index = String(index);
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", String(index === this._activeSuggestion));
      const rendered = provider.renderItem?.(item, context);
      if (rendered instanceof Node) option.append(rendered);
      else option.textContent = suggestionLabel(provider, item);
      this.suggestionPopup.append(option);
    });

    this._openSuggestions();
    this._setActiveSuggestion(this._activeSuggestion);
  }

  _openSuggestions() {
    this.suggestionPopup.hidden = false;
    if (this.suggestionPopup.hasAttribute("popover")) {
      try {
        if (!this.suggestionPopup.matches(":popover-open")) this.suggestionPopup.showPopover();
      } catch {
        // Hidden=false remains the functional fallback.
      }
    }
    this.surface.setAttribute("aria-expanded", "true");
    this._positionSuggestion();
    this._stopSuggestionAutoUpdate?.();
    this._stopSuggestionAutoUpdate = autoUpdate(null, this.suggestionPopup, () => this._positionSuggestion());
  }

  _positionSuggestion() {
    if (!this._suggestionItems.length) return;
    const rect = this.squire.getCursorPosition();
    repositionAt(rect.left, rect.bottom, this.suggestionPopup, {
      placement: "bottom-start",
      distance: 4,
    });
  }

  /** @param {number} index */
  _setActiveSuggestion(index) {
    if (!this._suggestionItems.length) return;
    this._activeSuggestion = Math.max(0, Math.min(index, this._suggestionItems.length - 1));
    /** @type {NodeListOf<HTMLElement>} */
    const options = this.suggestionPopup.querySelectorAll("[role=option]");
    for (const option of options) {
      const selected = Number(option.dataset.index) === this._activeSuggestion;
      option.setAttribute("aria-selected", String(selected));
      if (selected) {
        this.surface.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    }
  }

  /** @param {number} index */
  async _selectSuggestion(index) {
    const provider = this._suggestionProvider;
    const context = this._suggestionContext;
    const item = this._suggestionItems[index];
    if (!provider || !context || item === undefined) return;

    /** @type {SuggestionInsert} */
    let insertion;
    if (provider.insert) insertion = provider.insert(item, context);
    else if (provider.kind === "mention") {
      const label = suggestionLabel(provider, item);
      insertion = {
        type: "mention",
        id: provider.getId?.(item) ?? String(item?.id ?? ""),
        label: label.startsWith(provider.trigger) ? label : `${provider.trigger}${label}`,
        mentionType: provider.mentionType ?? "mention",
      };
    } else {
      insertion = { type: "text", text: suggestionLabel(provider, item) };
    }

    this.squire.setSelection(context.range);
    if (insertion.type === "mention") {
      this._insertMention(
        { id: insertion.id, label: insertion.label, type: insertion.mentionType ?? "mention" },
        context.range,
      );
      this.source.dispatchEvent(
        new CustomEvent("richtext:mentionselect", {
          bubbles: true,
          detail: { item, provider, mention: insertion },
        }),
      );
    } else if (insertion.type === "html") {
      this.squire.insertHTML(insertion.html);
    } else {
      this.squire.insertPlainText(insertion.text, false);
    }

    this._closeSuggestions();
    this.squire.focus();
  }

  /** @param {{ id: string, label: string, type?: string }} mention @param {Range} range */
  _insertMention(mention, range) {
    const id = String(mention.id ?? "").trim();
    const label = String(mention.label ?? "").trim();
    const type = String(mention.type ?? "mention").trim() || "mention";
    if (!id || !label) throw new TypeError("A mention requires non-empty id and label values.");

    const span = this.source.ownerDocument.createElement("span");
    span.setAttribute("data-rt-mention", type);
    span.setAttribute("data-id", id);
    span.setAttribute("contenteditable", "false");
    span.textContent = label;

    this.squire.setSelection(range);
    this.squire.insertHTML(`${span.outerHTML} `);
  }

  _closeSuggestions() {
    this._suggestionAbort?.abort();
    this._suggestionAbort = null;
    this._suggestionRevision += 1;
    this._suggestionItems = [];
    this._suggestionProvider = null;
    this._suggestionContext = null;
    this._stopSuggestionAutoUpdate?.();
    this._stopSuggestionAutoUpdate = null;
    this.surface.removeAttribute("aria-activedescendant");
    this.surface.setAttribute("aria-expanded", "false");

    if (this.suggestionPopup?.hasAttribute("popover")) {
      try {
        if (this.suggestionPopup.matches(":popover-open")) this.suggestionPopup.hidePopover();
      } catch {
        // hidden below is the fallback.
      }
    }
    if (this.suggestionPopup) {
      this.suggestionPopup.hidden = true;
      this.suggestionPopup.replaceChildren();
    }
  }
}

/** @param {{ href: string }} context */
function defaultLinkRequest({ href }) {
  return window.prompt("Link URL", href || "https://");
}

/** @param {Element} from @param {Element} to @param {string} name */
function copyAttribute(from, to, name) {
  const value = from.getAttribute(name);
  if (value == null) to.removeAttribute(name);
  else to.setAttribute(name, value);
}

/** @param {SuggestionProvider} provider @param {any} item @returns {string} */
function suggestionLabel(provider, item) {
  return String(provider.getLabel?.(item) ?? item?.label ?? item?.name ?? item ?? "");
}

/** @param {Range} range @param {-1 | 1} direction @param {HTMLElement} root @returns {HTMLElement | null} */
function adjacentMention(range, direction, root) {
  let node = range.startContainer;
  let offset = range.startOffset;

  if (node instanceof Text) {
    if (direction < 0 && offset > 0) return null;
    if (direction > 0 && offset < node.length) return null;
    const sibling = direction < 0 ? node.previousSibling : node.nextSibling;
    if (sibling) node = sibling;
    else {
      while (node.parentNode && node.parentNode !== root) {
        const parent = node.parentNode;
        const next = direction < 0 ? parent.previousSibling : parent.nextSibling;
        if (next) {
          node = next;
          break;
        }
        node = parent;
      }
    }
  } else {
    const index = direction < 0 ? offset - 1 : offset;
    node = node.childNodes[index] ?? node;
  }

  if (node instanceof Text && !node.data.length) {
    const sibling = direction < 0 ? node.previousSibling : node.nextSibling;
    if (sibling) node = sibling;
  }
  return node instanceof HTMLElement && node.hasAttribute("data-rt-mention") ? node : null;
}
