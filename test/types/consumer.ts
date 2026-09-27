import {
  RichText,
  RichTextElement,
  defineRichText,
  matchSuggestionText,
  type RichTextOptions,
} from "@lekoala/rich-text";

const textarea = document.createElement("textarea");
const options: RichTextOptions = {
  toolbar: ["bold", "italic"],
  suggestions: [
    {
      trigger: "@",
      kind: "mention",
      search: async () => [{ id: "1", label: "A" }],
      getId: (item) => item.id,
      getLabel: (item) => item.label,
    },
  ],
};
const editor = new RichText(textarea, options);
editor.getMentions();
editor.dispose();

const element: RichTextElement = document.createElement("rich-text") as RichTextElement;
element.configure(options);
defineRichText();
matchSuggestionText("@a", ["@"])?.query;
