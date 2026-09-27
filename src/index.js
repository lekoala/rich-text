export { RichText } from "./rich-text.js";
export { RichTextElement, defineRichText } from "./rich-text-element.js";
export {
  DEFAULT_TOOLBAR,
  isEditorEmpty,
  isSafeHref,
  matchSuggestionText,
  mentionFromElement,
  normalizeToolbar,
} from "./helpers.js";
export {
  DEFAULT_ALLOWED_ATTRIBUTES,
  DEFAULT_ALLOWED_TAGS,
  createSanitizeToDOMFragment,
} from "./sanitize.js";

/** @typedef {import("./rich-text.js").RichTextOptions} RichTextOptions */
/** @typedef {import("./rich-text.js").SuggestionProvider} SuggestionProvider */
/** @typedef {import("./rich-text.js").SuggestionInsert} SuggestionInsert */
