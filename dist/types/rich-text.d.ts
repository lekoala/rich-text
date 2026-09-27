import Squire from "squire-rte";
export type MentionInsert = {
    type: "mention";
    id: string;
    label: string;
    mentionType?: string;
};
export type TextInsert = {
    type: "text";
    text: string;
};
export type HtmlInsert = {
    type: "html";
    html: string;
};
export type SuggestionInsert = MentionInsert | TextInsert | HtmlInsert;
export type SuggestionContext = {
    trigger: string;
    query: string;
    signal: AbortSignal;
    richText: RichText;
};
export type SuggestionProvider = {
    trigger: string;
    minChars?: number;
    kind?: "mention" | "generic";
    mentionType?: string;
    search: (query: string, context: SuggestionContext) => any[] | Promise<any[]>;
    getLabel?: (item: any) => string;
    getId?: (item: any) => string;
    renderItem?: (item: any, context: SuggestionContext) => Node;
    insert?: (item: any, context: SuggestionContext) => SuggestionInsert;
};
export type ActiveSuggestionContext = SuggestionContext & {
    range: Range;
};
export type ToolbarButtonOverride = {
    /**
     * Accessible name and tooltip.
     */
    label?: string;
    /**
     * Visible content: a string is rendered as text; a function
     * returns a Node (e.g. an icon).
     */
    content?: string | (() => Node);
};
export type RichTextOptions = {
    /**
     * Commands in order; `|` separates groups.
     */
    toolbar?: string[] | string;
    /**
     * Per-command label/content overrides.
     */
    buttons?: Record<string, ToolbarButtonOverride>;
    /**
     * Accessible name of the toolbar. Defaults to "Formatting".
     */
    toolbarLabel?: string;
    suggestions?: SuggestionProvider[];
    sanitizeToDOMFragment?: (html: string, editor: Squire) => DocumentFragment;
    requestLink?: (context: {
        href: string;
        text: string;
        richText: RichText;
    }) => string | null | Promise<string | null>;
};
/**
 * Small, opinionated Squire adapter. The supplied textarea remains the form-value owner.
 */
export declare class RichText {
    source: HTMLTextAreaElement;
    /** @type {{
     * toolbar: string[],
     * buttons: Record<string, ToolbarButtonOverride>,
     * toolbarLabel: string,
     * suggestions: SuggestionProvider[],
     * sanitizeToDOMFragment: (html: string, editor: Squire) => DocumentFragment,
     * requestLink: (context: { href: string, text: string, richText: RichText }) => string | null | Promise<string | null>
     * }} */
    options: {
        toolbar: string[];
        buttons: Record<string, ToolbarButtonOverride>;
        toolbarLabel: string;
        suggestions: SuggestionProvider[];
        sanitizeToDOMFragment: (html: string, editor: Squire) => DocumentFragment;
        requestLink: (context: {
            href: string;
            text: string;
            richText: RichText;
        }) => string | null | Promise<string | null>;
    };
    _controller: AbortController;
    /** @type {HTMLFormElement | null} */
    _form: HTMLFormElement | null;
    _disposed: boolean;
    _sourceWasHidden: boolean;
    /** @type {{ label: HTMLLabelElement, id: string }[]} */
    _generatedLabelIds: {
        label: HTMLLabelElement;
        id: string;
    }[];
    _dispatchingSource: boolean;
    _settingEditor: boolean;
    _focusValue: string;
    _canUndo: boolean;
    _canRedo: boolean;
    _composing: boolean;
    /** @type {AbortController | null} */
    _suggestionAbort: AbortController | null;
    _suggestionRevision: number;
    /** @type {{ node: Node, start: number, query: string, provider: SuggestionProvider } | null} */
    _suggestionKey: {
        node: Node;
        start: number;
        query: string;
        provider: SuggestionProvider;
    } | null;
    /** @type {ActiveSuggestionContext | null} */
    _suggestionContext: ActiveSuggestionContext | null;
    /** @type {any[]} */
    _suggestionItems: any[];
    /** @type {SuggestionProvider | null} */
    _suggestionProvider: SuggestionProvider | null;
    _activeSuggestion: number;
    /** @type {(() => void) | null} */
    _stopSuggestionAutoUpdate: (() => void) | null;
    shell: HTMLDivElement;
    toolbar: HTMLDivElement;
    surface: HTMLDivElement;
    /** @type {Squire} */
    squire: Squire;
    suggestionPopup: HTMLDivElement;
    /** @type {MutationObserver} */
    _sourceObserver: MutationObserver;
    /**
     * @param {HTMLTextAreaElement} source
     * @param {RichTextOptions} [options]
     */
    constructor(source: HTMLTextAreaElement, options?: RichTextOptions);
    /** @returns {string} */
    get value(): string;
    /**
     * Disabled directly or through an ancestor `<fieldset disabled>`.
     * @returns {boolean}
     */
    get disabled(): boolean;
    /** @returns {boolean} */
    get editable(): boolean;
    focus(): void;
    /** Pull an externally changed textarea value into Squire. */
    sync(): this;
    /**
     * @param {string} html
     * @returns {this}
     */
    setHTML(html: string): this;
    /** @returns {string} */
    getHTML(): string;
    /**
     * Mentions in document order. Duplicates are preserved intentionally.
     * @returns {{ type: string, id: string, label: string }[]}
     */
    getMentions(): {
        type: string;
        id: string;
        label: string;
    }[];
    /**
     * Insert a structured, atomic mention at the current selection.
     * @param {{ id: string, label: string, type?: string }} mention
     * @returns {this}
     */
    insertMention(mention: {
        id: string;
        label: string;
        type?: string;
    }): this;
    /** Tear down generated UI and restore the source textarea. Safe to call more than once. */
    dispose(): void;
    _bind(): void;
    /**
     * Single entry point for DOM and Squire listeners. Squire events are fresh CustomEvents that are never
     * dispatched, so they are the only ones without a currentTarget.
     * @param {Event} event
     */
    handleEvent(event: Event): void;
    /** @param {Event} event */
    _onSquireEvent(event: Event): void;
    /** @param {Event} event */
    _onShellEvent(event: Event): void;
    /** @param {Event} event */
    _onSourceEvent(event: Event): void;
    /** @param {Event} event */
    _onFormReset(event: Event): void;
    /** @param {Event} event */
    _onLabelClick(event: Event): void;
    /** @param {Event} event */
    _onDocumentPointerdown(event: Event): void;
    _buildToolbar(): void;
    /** @param {HTMLButtonElement | null} [preferred] */
    _syncToolbarTabStops(preferred?: HTMLButtonElement | null): void;
    /** @param {EventTarget | null} target */
    _rememberToolbarButton(target: EventTarget | null): void;
    /** @param {KeyboardEvent} event */
    _onToolbarKeydown(event: KeyboardEvent): void;
    /** @param {Event} event */
    _onToolbarClick(event: Event): Promise<void>;
    /** @param {string} command */
    _executeCommand(command: string): Promise<void>;
    _toggleLink(): Promise<void>;
    _updateToolbarState(): void;
    /** @param {string} html */
    _setEditorHTML(html: string): void;
    /** @param {boolean} dispatchInput */
    _syncFromEditor(dispatchInput: boolean): void;
    /**
     * The vocabulary has no inline styles, but anything that restyles the live editor (browser extensions,
     * test harnesses hiding the caret) writes `style` into it. That must never reach the form value.
     * @returns {string}
     */
    _serialize(): string;
    /** @param {string} type */
    _dispatchSource(type: string): void;
    _copyAccessibility(): void;
    _syncEditableState(): void;
    /**
     * Squire observes attribute mutations on its root and reports them as document edits (input event,
     * undo state). Component state attributes are therefore written outside its observer, and only when
     * they actually change; otherwise every write would trigger an input that writes again.
     * @param {Record<string, string | null>} attributes
     */
    _setSurfaceAttributes(attributes: Record<string, string | null>): void;
    /** Squire ships shortcuts for tags outside the default vocabulary (underline, strike, sub/sup, code). */
    _restrictShortcuts(): void;
    /** @returns {HTMLDivElement} */
    _createSuggestionPopup(): HTMLDivElement;
    /** @param {KeyboardEvent} event */
    _onEditorKeydown(event: KeyboardEvent): void;
    /** Grow a non-collapsed selection so that it never starts or ends inside a mention. */
    _selectWholeMentions(): void;
    /** @param {string} key @returns {boolean} */
    _removeAdjacentMention(key: string): boolean;
    _updateSuggestion(): Promise<void>;
    _renderSuggestions(): void;
    _openSuggestions(): void;
    _positionSuggestion(): void;
    /** @param {number} index */
    _setActiveSuggestion(index: number): void;
    /** @param {number} index */
    _selectSuggestion(index: number): void;
    /** @param {{ id: string, label: string, type?: string }} mention @param {Range} range */
    _insertMention(mention: {
        id: string;
        label: string;
        type?: string;
    }, range: Range): void;
    _closeSuggestions(): void;
    _hideSuggestionRows(): void;
}
//# sourceMappingURL=rich-text.d.ts.map