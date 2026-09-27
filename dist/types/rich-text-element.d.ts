import { RichText } from "./rich-text.js";
export type RichTextOptions = import("./rich-text.js").RichTextOptions;
/** @typedef {import("./rich-text.js").RichTextOptions} RichTextOptions */
/**
 * Declarative lifecycle owner for a textarea-backed RichText instance.
 * The child textarea always remains the native form-value owner.
 */
export declare class RichTextElement extends HTMLElement {
    #private;
    /** @type {RichText | null} */
    _richText: RichText | null;
    /** @type {RichTextOptions} */
    _options: RichTextOptions;
    /** @type {MutationObserver | null} */
    _sourceObserver: MutationObserver | null;
    _revision: number;
    _rebuildQueued: boolean;
    /** @type {Array<(richText: RichText) => void>} */
    _readyResolvers: Array<(richText: RichText) => void>;
    static get observedAttributes(): string[];
    constructor();
    connectedCallback(): void;
    disconnectedCallback(): void;
    /**
     * @param {string} _name
     * @param {string | null} oldValue
     * @param {string | null} newValue
     */
    attributeChangedCallback(_name: string, oldValue: string | null, newValue: string | null): void;
    /** @returns {HTMLTextAreaElement | null} */
    get source(): HTMLTextAreaElement | null;
    /** @returns {RichText | null} */
    get richText(): RichText | null;
    /** @returns {RichTextOptions} */
    get options(): RichTextOptions;
    /** @param {RichTextOptions} value */
    set options(value: RichTextOptions);
    /** @param {RichTextOptions} [options] @returns {this} */
    configure(options?: RichTextOptions): this;
    /** @returns {RichText | null} */
    upgrade(): RichText | null;
    /** @returns {Promise<RichText>} */
    whenReady(): Promise<RichText>;
    dispose(): void;
}
/**
 * Register the official <rich-text> element once.
 * @returns {typeof RichTextElement}
 */
export declare function defineRichText(): typeof RichTextElement;
//# sourceMappingURL=rich-text-element.d.ts.map