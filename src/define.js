/**
 * Side-effect entry: registers <rich-text>.
 * Importing @lekoala/rich-text itself never registers a custom element.
 */
import { defineRichText } from "./rich-text-element.js";

defineRichText();
