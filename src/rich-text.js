import { autoUpdate, repositionAt } from "@lekoala/floating";
import Squire from "squire-rte";
import {
  isEditorEmpty,
  isSafeHref,
  matchSuggestionText,
  mentionFromElement,
  normalizeToolbar,
  toolbarGroups,
} from "./helpers.js";
import { sanitizeToDOMFragment } from "./sanitize.js";

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
 * @typedef {Object} ToolbarButtonOverride
 * @property {string} [label] Accessible name and tooltip.
 * @property {string | (() => Node)} [content] Visible content: a string is rendered as text; a function
 *   returns a Node (e.g. an icon).
 *
 * @typedef {Object} RichTextOptions
 * @property {string[] | string} [toolbar] Commands in order; `|` separates groups.
 * @property {Record<string, ToolbarButtonOverride>} [buttons] Per-command label/content overrides.
 * @property {string} [toolbarLabel] Accessible name of the toolbar. Defaults to "Formatting".
 * @property {SuggestionProvider[]} [suggestions]
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

/** Keys that never modify the document; any other key may replace a non-collapsed selection. */
const NAVIGATION_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  "Escape",
  "Tab",
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "CapsLock",
]);

/** Squire uses zero-width spaces as caret placeholders; they are not content. */
const INVISIBLE_TEXT = /^[​﻿]*$/;
const BLOCK_BOUNDARY =
  /^(?:ADDRESS|ARTICLE|ASIDE|BLOCKQUOTE|BR|DD|DIV|DL|DT|FIGURE|FOOTER|H[1-6]|HEADER|HR|LI|OL|P|PRE|SECTION|UL)$/;

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
     * buttons: Record<string, ToolbarButtonOverride>,
     * toolbarLabel: string,
     * suggestions: SuggestionProvider[],
     * requestLink: (context: { href: string, text: string, richText: RichText }) => string | null | Promise<string | null>
     * }} */
    this.options = {
      toolbar: normalizeToolbar(options.toolbar),
      buttons: options.buttons ?? {},
      toolbarLabel: options.toolbarLabel ?? "Formatting",
      suggestions: options.suggestions ?? [],
      requestLink: options.requestLink ?? defaultLinkRequest,
    };

    this._controller = new AbortController();
    /** @type {AbortController | null} */
    this._contextController = null;
    /** @type {MutationObserver | null} */
    this._fieldsetObserver = null;
    /** @type {HTMLFormElement | null} */
    this._form = null;
    this._linkRequest = 0;
    this._disposed = false;
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
    /** @type {{ node: Node, start: number, query: string, provider: SuggestionProvider } | null} */
    this._suggestionKey = null;
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
    this.toolbar.setAttribute("aria-label", this.options.toolbarLabel);

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
    // The sanitizer is not an option: a replacement would bypass the mandatory policy.
    this.squire = new Squire(this.surface, { blockTag: "P", sanitizeToDOMFragment });
    this._restrictShortcuts();
    this._restrictLinkDetection();

    this.suggestionPopup = this._createSuggestionPopup();
    this._bind();
    this._setEditorHTML(source.value);
    this._syncEditableState();
  }

  /** @returns {string} */
  get value() {
    return this.source.value;
  }

  /**
   * Disabled directly or through an ancestor `<fieldset disabled>`.
   * @returns {boolean}
   */
  get disabled() {
    return this.source.disabled || this.source.matches(":disabled");
  }

  /** @returns {boolean} */
  get editable() {
    return !this.disabled && !this.source.readOnly;
  }

  focus() {
    if (this._disposed) return;
    this.squire.focus();
  }

  /**
   * Re-read the textarea's document context (form, labels, ancestor fieldsets) after it moved in the DOM.
   * `<rich-text>` calls this when it is reconnected.
   * @returns {this}
   */
  refresh() {
    if (this._disposed) return this;
    this._bindContext();
    this._copyAccessibility();
    this._syncEditableState();
    return this;
  }

  /** Pull an externally changed textarea value into Squire. */
  sync() {
    if (this._disposed) return this;
    this._setEditorHTML(this.source.value);
    this._syncEditableState();
    return this;
  }

  /**
   * @param {string} html
   * @returns {this}
   */
  setHTML(html) {
    if (!this._disposed) this._setEditorHTML(html);
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

  /** Tear down generated UI and restore the source textarea. Safe to call more than once. */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._suggestionAbort?.abort();
    this._stopSuggestionAutoUpdate?.();
    this._controller.abort();
    this._contextController?.abort();
    this._sourceObserver?.disconnect();
    this._fieldsetObserver?.disconnect();
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

    // Every listener is this object (EventListener interface); handleEvent() routes the events.
    for (const type of ["input", "pathChange", "cursor", "select", "undoStateChange", "pasteImage"]) {
      this.squire.addEventListener(type, this);
    }

    // Squire listens on its root in the capture phase, so at-target listeners run after it. Capturing on
    // the shell (an ancestor) is the only way to act, and preventDefault(), before Squire handles a key.
    // cut/paste/drop: a selection edge inside a mention would let Squire split it into partial mentions.
    for (const type of ["keydown", "cut", "paste", "drop"]) {
      this.shell.addEventListener(type, this, { capture: true, signal });
    }
    for (const type of ["mousedown", "click", "focusin", "focusout", "compositionstart", "compositionend"]) {
      this.shell.addEventListener(type, this, { signal });
    }
    for (const type of ["input", "change", "invalid"]) {
      this.source.addEventListener(type, this, { signal });
    }
    // Outside pointerdown closes suggestions; pointerdown on a suggestion picks it without moving focus.
    this.source.ownerDocument.addEventListener("pointerdown", this, { capture: true, signal });

    /** @type {MutationObserver} */
    this._sourceObserver = new MutationObserver(() => {
      if (this._disposed) return;
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
        "aria-labelledby",
        "placeholder",
        "spellcheck",
        "autocapitalize",
      ],
    });
    this._bindContext();
  }

  /** Subscriptions that depend on where the textarea sits: its form, its labels, its ancestor fieldsets. */
  _bindContext() {
    this._contextController?.abort();
    this._contextController = new AbortController();
    const signal = this._contextController.signal;

    this._form = this.source.form;
    this._form?.addEventListener("reset", this, { signal });
    for (const label of this.source.labels ?? []) {
      label.addEventListener("click", this, { signal });
    }

    // `<fieldset disabled>` disables the textarea without touching its own attributes.
    this._fieldsetObserver?.disconnect();
    this._fieldsetObserver = new MutationObserver(() => {
      if (!this._disposed) this._syncEditableState();
    });
    for (let fieldset = this.source.parentElement?.closest("fieldset"); fieldset; ) {
      this._fieldsetObserver.observe(fieldset, { attributes: true, attributeFilter: ["disabled"] });
      fieldset = fieldset.parentElement?.closest("fieldset");
    }
  }

  /**
   * Single entry point for DOM and Squire listeners. Squire events are fresh CustomEvents that are never
   * dispatched, so they are the only ones without a currentTarget.
   * @param {Event} event
   */
  handleEvent(event) {
    if (this._disposed) return;
    const current = event.currentTarget;
    if (!current) this._onSquireEvent(event);
    else if (current === this.shell) this._onShellEvent(event);
    else if (current === this.source) this._onSourceEvent(event);
    else if (current === this._form) this._onFormReset(event);
    else if (current === this.source.ownerDocument) this._onDocumentPointerdown(event);
    else if (current instanceof HTMLLabelElement) this._onLabelClick(event);
  }

  /** @param {Event} event */
  _onSquireEvent(event) {
    switch (event.type) {
      case "input":
        if (this._settingEditor) return;
        this._syncFromEditor(true);
        if (!this._composing) this._updateSuggestion();
        break;
      case "pathChange":
        this._updateToolbarState();
        break;
      case "cursor":
        this._updateToolbarState();
        if (!this._composing) this._updateSuggestion();
        break;
      case "select":
        this._updateToolbarState();
        this._closeSuggestions();
        break;
      case "undoStateChange": {
        const detail = /** @type {CustomEvent<{ canUndo?: boolean, canRedo?: boolean }>} */ (event).detail;
        this._canUndo = Boolean(detail?.canUndo);
        this._canRedo = Boolean(detail?.canRedo);
        this._updateToolbarState();
        break;
      }
      case "pasteImage":
        event.preventDefault();
        break;
    }
  }

  /** @param {Event} event */
  _onShellEvent(event) {
    const target = event.target instanceof Node ? event.target : null;
    const inSurface = Boolean(target && (target === this.surface || this.surface.contains(target)));
    const inToolbar = Boolean(target && this.toolbar.contains(target));

    switch (event.type) {
      case "keydown":
        if (inSurface) this._onEditorKeydown(/** @type {KeyboardEvent} */ (event));
        else if (inToolbar) this._onToolbarKeydown(/** @type {KeyboardEvent} */ (event));
        break;
      case "cut":
      case "paste":
      case "drop":
        if (inSurface) this._selectWholeMentions();
        break;
      case "mousedown":
        // Pointer use of the toolbar keeps focus, and the selection, in the editor. Keyboard users still
        // reach the buttons with Tab (roving tabindex).
        if (inToolbar && target instanceof Element && target.closest("button")) event.preventDefault();
        break;
      case "click":
        if (inToolbar) this._onToolbarClick(event);
        break;
      case "compositionstart":
        this._composing = true;
        this._closeSuggestions();
        break;
      case "compositionend":
        this._composing = false;
        queueMicrotask(() => {
          if (!this._disposed) this._updateSuggestion();
        });
        break;
      case "focusin": {
        const previous = /** @type {FocusEvent} */ (event).relatedTarget;
        if (!(previous instanceof Node) || !this.shell.contains(previous)) {
          this._focusValue = this.source.value;
        }
        if (inToolbar) this._rememberToolbarButton(target);
        if (!inSurface) this._closeSuggestions();
        break;
      }
      case "focusout":
        queueMicrotask(() => {
          if (this._disposed) return;
          const active = this.source.ownerDocument.activeElement;
          if (active && this.shell.contains(active)) return;
          this._closeSuggestions();
          if (this.source.value !== this._focusValue) this._dispatchSource("change");
        });
        break;
    }
  }

  /** @param {Event} event */
  _onSourceEvent(event) {
    if (event.type !== "invalid") {
      // input/change dispatched by external code after it changed textarea.value.
      if (!this._dispatchingSource) this.sync();
      return;
    }
    // The hidden textarea cannot show the native bubble. The visible editor takes focus instead, but
    // only when it is the form's first invalid control, as native interactive validation would do.
    event.preventDefault();
    if (firstInvalidControl(this.source) === this.source) this.focus();
    this.source.dispatchEvent(
      new CustomEvent("richtext:invalid", { bubbles: true, detail: { richText: this } }),
    );
  }

  /** @param {Event} event */
  _onFormReset(event) {
    if (event.defaultPrevented) return;
    // Controls are reset after the event is dispatched.
    queueMicrotask(() => {
      this.sync();
      this._focusValue = this.source.value;
    });
  }

  /** @param {Event} event */
  _onLabelClick(event) {
    if (event.defaultPrevented || !this.editable) return;
    // A wrapping label also receives clicks made inside the editor or its toolbar.
    if (event.target instanceof Node && this.shell.contains(event.target)) return;
    queueMicrotask(() => this.focus());
  }

  /** @param {Event} event */
  _onDocumentPointerdown(event) {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.suggestionPopup.contains(target)) {
      const element = target instanceof Element ? target : target.parentElement;
      const option = element?.closest("[role=option]");
      if (!(option instanceof HTMLElement)) return;
      // Keep focus (and the caret) in the editor.
      event.preventDefault();
      const index = Number(option.dataset.index);
      if (Number.isInteger(index)) this._selectSuggestion(index);
    } else if (!this.shell.contains(target)) {
      this._closeSuggestions();
    }
  }

  _buildToolbar() {
    const doc = this.source.ownerDocument;
    this.toolbar.replaceChildren();
    for (const commands of toolbarGroups(this.options.toolbar)) {
      const group = doc.createElement("div");
      group.className = "rt-group";
      group.setAttribute("role", "group");
      for (const command of commands) {
        const config = BUTTONS[command];
        if (!config) continue;
        const override = this.options.buttons[command] ?? {};
        const label = override.label ?? config.label;
        const button = doc.createElement("button");
        button.type = "button";
        button.className = "rt-button";
        button.dataset.command = command;
        button.setAttribute("aria-label", label);
        button.title = label;
        const content = typeof override.content === "function" ? override.content() : override.content;
        if (content instanceof Node) button.append(content);
        else button.textContent = content ?? config.text;
        if (config.toggle) button.setAttribute("aria-pressed", "false");
        group.append(button);
      }
      if (group.children.length) this.toolbar.append(group);
    }
    this.toolbar.hidden = !this.toolbar.children.length;
    this._syncToolbarTabStops();
  }

  /** @param {HTMLButtonElement | null} [preferred] */
  _syncToolbarTabStops(preferred = null) {
    const buttons = [...this.toolbar.querySelectorAll("button:not(:disabled)")].filter(
      (button) => button instanceof HTMLButtonElement,
    );
    const current = buttons.find((button) => button.tabIndex === 0) ?? null;
    const target = preferred && buttons.includes(preferred) ? preferred : (current ?? buttons[0] ?? null);
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

  /** @param {Event} event */
  async _onToolbarClick(event) {
    const button = event.target instanceof Element ? event.target.closest("button[data-command]") : null;
    if (!(button instanceof HTMLButtonElement) || button.disabled || !this.editable) return;
    await this._executeCommand(button.dataset.command ?? "");
    if (!this._disposed) this._updateToolbarState();
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
    // A live range: it follows edits around it, and its containers change if its own nodes are removed.
    const range = editor.getSelection().cloneRange();
    const { startContainer, endContainer } = range;
    const node = startContainer instanceof Element ? startContainer : startContainer.parentElement;
    const link = node?.closest("a") ?? null;
    const href = link?.getAttribute("href") ?? "";
    const text = editor.getSelectedText();
    const request = ++this._linkRequest;
    const next = await this.options.requestLink({ href, text, richText: this });

    // The answer applies to the selection it was asked for, or not at all: it is dropped after dispose, a
    // newer request, a content replacement (setHTML/sync/reset), a readonly/disabled switch, or an edit
    // that removed the targeted nodes.
    if (next == null || this._disposed || request !== this._linkRequest || !this.editable) return;
    if (range.startContainer !== startContainer || range.endContainer !== endContainer) return;
    if (!this.surface.contains(startContainer) || !this.surface.contains(endContainer)) return;

    editor.focus();
    editor.setSelection(range);
    const value = next.trim();
    if (value && !isSafeHref(value)) {
      this.source.dispatchEvent(
        new CustomEvent("richtext:linkerror", {
          bubbles: true,
          detail: { href: next },
        }),
      );
      return;
    }

    // Squire's link commands act on the selection: from a bare caret inside a link, makeLink would insert
    // the URL as new text and removeLink would do nothing. Edit the whole existing link instead.
    if (link?.isConnected && this.surface.contains(link) && range.collapsed) {
      const whole = this.source.ownerDocument.createRange();
      whole.selectNodeContents(link);
      editor.setSelection(whole);
    }
    if (value) editor.makeLink(value);
    else editor.removeLink();
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
    this._linkRequest += 1;
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
    if (this._disposed) return;
    const html = isEditorEmpty(this.surface) ? "" : this._serialize();
    const changed = this.source.value !== html;
    this.source.value = html;
    this._setSurfaceAttributes({ "data-empty": String(!html) });
    if (changed && dispatchInput) this._dispatchSource("input");
  }

  /**
   * The vocabulary has no inline styles, but anything that restyles the live editor (browser extensions,
   * test harnesses hiding the caret) writes `style` into it. That must never reach the form value.
   * @returns {string}
   */
  _serialize() {
    const html = this.squire.getHTML();
    if (!html.includes("style=")) return html;
    const template = this.source.ownerDocument.createElement("template");
    template.innerHTML = html;
    for (const element of template.content.querySelectorAll("[style]")) element.removeAttribute("style");
    return template.innerHTML;
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
    // As on the native control, an authored aria-labelledby wins over <label> elements.
    const labelledBy = source.getAttribute("aria-labelledby")?.split(/\s+/).filter(Boolean) ?? [];

    if (!labelledBy.length) {
      for (const label of source.labels ?? []) {
        if (!label.id) {
          const id = `rt-label-${++uid}`;
          label.id = id;
          this._generatedLabelIds.push({ label, id });
        }
        labelledBy.push(label.id);
      }
    }

    this._setSurfaceAttributes({
      "aria-label": source.getAttribute("aria-label") || null,
      "aria-labelledby": labelledBy.length ? labelledBy.join(" ") : null,
      "aria-describedby": source.getAttribute("aria-describedby"),
      "aria-invalid": source.getAttribute("aria-invalid"),
      "aria-required": String(source.required),
      spellcheck: String(source.spellcheck),
      autocapitalize: source.getAttribute("autocapitalize"),
      "data-placeholder": source.placeholder || "",
    });
  }

  _syncEditableState() {
    const disabled = this.disabled;
    this._setSurfaceAttributes({
      contenteditable: String(this.editable),
      tabindex: disabled ? "-1" : "0",
      "aria-disabled": String(disabled),
      "aria-readonly": String(this.source.readOnly),
    });
    this.shell.toggleAttribute("data-disabled", disabled);
    this.shell.toggleAttribute("data-readonly", this.source.readOnly);
    if (!this.editable) this._closeSuggestions();
    this._updateToolbarState();
  }

  /**
   * Squire observes attribute mutations on its root and reports them as document edits (input event,
   * undo state). Component state attributes are therefore written outside its observer, and only when
   * they actually change; otherwise every write would trigger an input that writes again.
   * @param {Record<string, string | null>} attributes
   */
  _setSurfaceAttributes(attributes) {
    const surface = this.surface;
    const changes = Object.entries(attributes).filter(
      ([name, value]) => surface.getAttribute(name) !== value,
    );
    if (!changes.length) return;
    const apply = () => {
      for (const [name, value] of changes) {
        if (value == null) surface.removeAttribute(name);
        else surface.setAttribute(name, value);
      }
    };
    if (this.squire) this.squire.modifyDocument(apply);
    else apply();
  }

  /** Squire ships shortcuts for tags outside the default vocabulary (underline, strike, sub/sup, code). */
  _restrictShortcuts() {
    for (const modifier of ["Ctrl-", "Meta-"]) {
      // Without a handler, Ctrl+U would fall through to the browser's native underline command.
      this.squire.setKeyHandler(`${modifier}u`, (_editor, event) => event.preventDefault());
      for (const key of ["Shift-5", "Shift-6", "Shift-7", "d"])
        this.squire.setKeyHandler(`${modifier}${key}`, null);
    }
  }

  /**
   * Squire auto-links typed and pasted URLs without going through the sanitizer, and its pattern also
   * matches `ftp://`. Restrict it to http(s)/www/bare domains and e-mail addresses (mailto:), which are all
   * inside the link policy. An unrecognised pattern (a future Squire) disables detection instead.
   */
  _restrictLinkDetection() {
    const pattern = this.squire.linkRegExp;
    const source = pattern.source.replace("(?:ht|f)tps?", "https?");
    this.squire.linkRegExp = source === pattern.source ? /(?!)/ : new RegExp(source, pattern.flags);
  }

  /**
   * The popover lives in the shell, outside the Squire surface: it inherits the instance's theme tokens and
   * stays in the interactive subtree of a modal `<dialog>`. As a popover it renders in the top layer, so the
   * shell's clipping does not apply.
   * @returns {HTMLDivElement}
   */
  _createSuggestionPopup() {
    const doc = this.source.ownerDocument;
    const popup = doc.createElement("div");
    popup.className = "rt-suggestions";
    popup.id = `rt-suggestions-${++uid}`;
    popup.setAttribute("role", "listbox");
    popup.hidden = true;
    if ("showPopover" in popup) popup.setAttribute("popover", "manual");
    this.shell.append(popup);

    if (this.options.suggestions.length) {
      this._setSurfaceAttributes({
        "aria-autocomplete": "list",
        "aria-haspopup": "listbox",
        "aria-controls": popup.id,
        "aria-expanded": "false",
      });
    }

    return popup;
  }

  /** @param {KeyboardEvent} event */
  _onEditorKeydown(event) {
    // keyCode 229: WebKit delivers the IME-confirming Enter after compositionend, with isComposing=false.
    if (event.isComposing || event.keyCode === 229 || !this.editable) return;

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
      return;
    }
    if (!NAVIGATION_KEYS.has(event.key)) this._selectWholeMentions();
  }

  /** Grow a non-collapsed selection so that it never starts or ends inside a mention. */
  _selectWholeMentions() {
    const range = this.squire.getSelection();
    if (range.collapsed) return;
    const start = closestMention(range.startContainer, this.surface);
    const end = closestMention(range.endContainer, this.surface);
    if (!start && !end) return;
    const next = range.cloneRange();
    if (start) next.setStartBefore(start);
    if (end) next.setEndAfter(end);
    this.squire.setSelection(next);
  }

  /** @param {string} key @returns {boolean} */
  _removeAdjacentMention(key) {
    const range = this.squire.getSelection();
    if (!range.collapsed) return false;
    const mention = adjacentMention(range, key === "Backspace" ? -1 : 1, this.surface);
    if (!mention) return false;

    const detail = mentionFromElement(mention);
    // Saving the undo state inserts/removes bookmarks and merges text nodes: read positions afterwards.
    this.squire.saveUndoState(range.cloneRange());
    const parent = mention.parentNode;
    if (!parent) return false;
    const index = [...parent.childNodes].indexOf(mention);
    mention.remove();

    const next = this.source.ownerDocument.createRange();
    next.setStart(parent, Math.max(0, Math.min(index, parent.childNodes.length)));
    next.collapse(true);
    this.squire.setSelection(next);
    this.squire.focus();
    queueMicrotask(() => this._syncFromEditor(true));
    this.source.dispatchEvent(new CustomEvent("richtext:mentionremove", { bubbles: true, detail }));
    return true;
  }

  async _updateSuggestion() {
    const providers = this.options.suggestions ?? [];
    const reset = () => {
      this._suggestionKey = null;
      this._closeSuggestions();
    };
    if (!providers.length || this._composing || !this.editable) return reset();

    const range = this.squire.getSelection();
    if (!range.collapsed || !(range.startContainer instanceof Text)) return reset();
    // A mention label is not text the user is typing.
    if (closestMention(range.startContainer, this.surface)) return reset();

    const textBeforeCaret = range.startContainer.data.slice(0, range.startOffset);
    const match = matchSuggestionText(
      textBeforeCaret,
      providers.map((provider) => provider.trigger),
    );
    if (!match) return reset();

    const provider = providers.find((entry) => entry.trigger === match.trigger);
    if (!provider || match.query.length < (provider.minChars ?? 0)) return reset();

    // One query is handled once: Squire reports both `input` and `cursor` for a keystroke, and a query the
    // user dismissed with Escape (or that returned nothing) must not reopen on the next caret event.
    const previous = this._suggestionKey;
    if (
      previous &&
      previous.node === range.startContainer &&
      previous.start === match.start &&
      previous.query === match.query &&
      previous.provider === provider
    ) {
      return;
    }
    this._suggestionKey = { node: range.startContainer, start: match.start, query: match.query, provider };

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

    // Rows of the previous query stay visible while this search runs. If one is picked meanwhile, it must
    // replace the whole current query, not the shorter one it was found for.
    if (this._suggestionItems.length) {
      if (this._suggestionProvider === provider)
        this._suggestionContext = { ...context, range: replaceRange };
      else this._hideSuggestionRows();
    }

    try {
      const items = await provider.search(match.query, context);
      if (controller.signal.aborted || revision !== this._suggestionRevision) return;
      this._suggestionAbort = null;
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
    this._setSurfaceAttributes({ "aria-expanded": "true" });
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
        this._setSurfaceAttributes({ "aria-activedescendant": option.id });
        option.scrollIntoView({ block: "nearest" });
      }
    }
  }

  /** @param {number} index */
  _selectSuggestion(index) {
    const provider = this._suggestionProvider;
    const context = this._suggestionContext;
    const item = this._suggestionItems[index];
    if (!provider || !context || item === undefined || !this.editable) return;

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

    // Close first: the insertion below changes the caret, which would otherwise start a new search.
    this._closeSuggestions();
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

    // Squire trims a trailing ASCII space from inserted HTML; without a separator at the end of a block the
    // caret would land inside the mention label. A no-break space survives, as Squire does for typed spaces.
    this.squire.setSelection(range);
    this.squire.insertHTML(`${span.outerHTML} `);
  }

  _closeSuggestions() {
    this._suggestionAbort?.abort();
    this._suggestionAbort = null;
    this._suggestionRevision += 1;
    this._hideSuggestionRows();
  }

  _hideSuggestionRows() {
    this._suggestionItems = [];
    this._suggestionProvider = null;
    this._suggestionContext = null;
    this._stopSuggestionAutoUpdate?.();
    this._stopSuggestionAutoUpdate = null;
    if (this.options.suggestions.length) {
      this._setSurfaceAttributes({ "aria-activedescendant": null, "aria-expanded": "false" });
    }

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

/** @param {SuggestionProvider} provider @param {any} item @returns {string} */
function suggestionLabel(provider, item) {
  return String(provider.getLabel?.(item) ?? item?.label ?? item?.name ?? item ?? "");
}

/** @param {Node} node @param {HTMLElement} root @returns {HTMLElement | null} */
function closestMention(node, root) {
  const element = node instanceof Element ? node : node.parentElement;
  const mention = element?.closest("[data-rt-mention]");
  return mention instanceof HTMLElement && mention !== root && root.contains(mention) ? mention : null;
}

/**
 * The node next to `node` in `direction`, climbing out of inline wrappers but never out of a block.
 * @param {Node} node @param {-1 | 1} direction @param {HTMLElement} root @returns {Node | null}
 */
function stepOut(node, direction, root) {
  /** @type {Node | null} */
  let current = node;
  while (current && current !== root) {
    const sibling = direction < 0 ? current.previousSibling : current.nextSibling;
    if (sibling) return sibling;
    current = current.parentNode;
    if (current instanceof Element && BLOCK_BOUNDARY.test(current.nodeName)) return null;
  }
  return null;
}

/**
 * The mention that Backspace (-1) or Delete (1) at a collapsed caret would reach first, if any.
 * Empty/zero-width text and inline wrappers (b, i, a…) between the caret and the mention are skipped;
 * visible text, line breaks and block boundaries are not.
 * @param {Range} range @param {-1 | 1} direction @param {HTMLElement} root @returns {HTMLElement | null}
 */
function adjacentMention(range, direction, root) {
  const container = range.startContainer;
  const offset = range.startOffset;
  const inside = closestMention(container, root);
  if (inside) return inside;

  /** @type {Node | null} */
  let node;
  if (container instanceof Text) {
    const rest = direction < 0 ? container.data.slice(0, offset) : container.data.slice(offset);
    if (!INVISIBLE_TEXT.test(rest)) return null;
    node = stepOut(container, direction, root);
  } else {
    node = container.childNodes[direction < 0 ? offset - 1 : offset] ?? stepOut(container, direction, root);
  }

  while (node) {
    if (node instanceof Text) {
      if (!INVISIBLE_TEXT.test(node.data)) return null;
      node = stepOut(node, direction, root);
    } else if (node instanceof HTMLElement) {
      if (node.hasAttribute("data-rt-mention")) return node;
      if (BLOCK_BOUNDARY.test(node.nodeName)) return null;
      node = (direction < 0 ? node.lastChild : node.firstChild) ?? stepOut(node, direction, root);
    } else {
      node = stepOut(node, direction, root);
    }
  }
  return null;
}

/** @param {HTMLTextAreaElement} source @returns {Element | null} */
function firstInvalidControl(source) {
  const controls = source.form ? [...source.form.elements] : [source];
  return (
    controls.find((control) => {
      const field = /** @type {HTMLTextAreaElement} */ (control);
      return field.willValidate === true && !field.validity.valid;
    }) ?? null
  );
}
