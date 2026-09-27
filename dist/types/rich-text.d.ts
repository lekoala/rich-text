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
export type RichTextOptions = {
    toolbar?: string[] | string;
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
     * suggestions: SuggestionProvider[],
     * sanitizeToDOMFragment: (html: string, editor: Squire) => DocumentFragment,
     * requestLink: (context: { href: string, text: string, richText: RichText }) => string | null | Promise<string | null>
     * }} */
    options: {
        toolbar: string[];
        suggestions: SuggestionProvider[];
        sanitizeToDOMFragment: (html: string, editor: Squire) => DocumentFragment;
        requestLink: (context: {
            href: string;
            text: string;
            richText: RichText;
        }) => string | null | Promise<string | null>;
    };
    _controller: AbortController;
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
    /** Tear down generated UI and restore the source textarea. */
    dispose(): void;
    _bind(): void;
    _buildToolbar(): void;
    /** @param {HTMLButtonElement | null} [preferred] */
    _syncToolbarTabStops(preferred?: HTMLButtonElement | null): void;
    /** @param {EventTarget | null} target */
    _rememberToolbarButton(target: EventTarget | null): void;
    /** @param {KeyboardEvent} event */
    _onToolbarKeydown(event: KeyboardEvent): void;
    /** @param {MouseEvent} event */
    _onToolbarClick(event: MouseEvent): Promise<void>;
    /** @param {string} command */
    _executeCommand(command: string): Promise<void>;
    _toggleLink(): Promise<void>;
    _updateToolbarState(): void;
    /** @param {string} html */
    _setEditorHTML(html: string): void;
    /** @param {boolean} dispatchInput */
    _syncFromEditor(dispatchInput: boolean): void;
    /** @param {string} type */
    _dispatchSource(type: string): void;
    _copyAccessibility(): void;
    _syncEditableState(): void;
    /** @returns {HTMLDivElement} */
    _createSuggestionPopup(): HTMLDivElement;
    /** @param {KeyboardEvent} event */
    _onEditorKeydown(event: KeyboardEvent): void;
    /** @param {string} key @returns {boolean} */
    _removeAdjacentMention(key: string): boolean;
    _updateSuggestion(): Promise<void>;
    _renderSuggestions(): void;
    _openSuggestions(): void;
    _positionSuggestion(): void;
    /** @param {number} index */
    _setActiveSuggestion(index: number): void;
    /** @param {number} index */
    _selectSuggestion(index: number): Promise<void>;
    /** @param {{ id: string, label: string, type?: string }} mention @param {Range} range */
    _insertMention(mention: {
        id: string;
        label: string;
        type?: string;
    }, range: Range): void;
    _closeSuggestions(): void;
}
//# sourceMappingURL=rich-text.d.ts.map