import {
  DEFAULT_TOOLBAR,
  defineRichText,
  isSafeHref,
  RichText,
  type RichTextElement,
  type RichTextOptions,
} from "@lekoala/rich-text";

const textarea = document.createElement("textarea");
const options: RichTextOptions = {
  toolbar: [...DEFAULT_TOOLBAR],
  suggestions: [
    {
      trigger: "@",
      kind: "mention",
      search: async () => [{ id: "1", label: "A" }],
      getId: (item) => item.id,
      getLabel: (item) => item.label,
    },
  ],
  requestLink: async ({ href }) => (isSafeHref(href) ? href : null),
};
const editor = new RichText(textarea, options);
editor.getMentions();
editor.refresh().sync();
editor.dispose();

const element: RichTextElement = document.createElement("rich-text") as RichTextElement;
element.configure(options);
defineRichText();
