# @lekoala/rich-text

A small, opinionated rich-text component built on [Squire](https://github.com/fastmail/Squire).

This package deliberately does **not** implement `contenteditable` editing rules. Squire owns selection,
editing, paste normalisation and undo/redo. `@lekoala/rich-text` owns the product-facing contract around it:

- progressive enhancement of a real `<textarea>`;
- a deliberately small toolbar;
- mandatory HTML sanitisation;
- structured `@mentions`;
- generic caret suggestions (`@`, `/`, or another trigger);
- form/reset/disabled/readonly integration;
- accessible generated UI;
- lifecycle and cleanup.

## Status

Prototype / pre-0.1. The main thing to validate before a first release is the atomic mention contract in the
Chromium + Firefox + WebKit browser matrix, especially Backspace/Delete, selection boundaries, IME and paste.

## Install

```sh
bun add @lekoala/rich-text
```

```js
import "@lekoala/rich-text/rich-text.css";
import { defineRichText } from "@lekoala/rich-text";

defineRichText();
```

```html
<label for="note">Project note</label>
<rich-text>
  <textarea id="note" name="note" required></textarea>
</rich-text>
```

Without JavaScript the textarea remains a normal textarea. With JavaScript it is hidden and stays the native
form-value owner; the component never invents a second serialized form state.

`<rich-text>` binds to its direct child textarea. If that textarea is replaced or removed (for example by a
framework re-render), the previous editor is disposed and a new one is bound to the new textarea.

Importing `@lekoala/rich-text` has no registration side effect. Consumers can either call `defineRichText()` or
import `@lekoala/rich-text/define` explicitly.

## Default scope

The default toolbar is intentionally small:

```text
bold italic | bullet-list ordered-list | link blockquote | undo redo
```

Use `toolbar="none"` or provide a list:

```html
<rich-text toolbar="bold italic bullet-list ordered-list undo redo">
  <textarea name="note"></textarea>
</rich-text>
```

Images, tables, colors, arbitrary font styles, embeds and attachments are out of scope. Attachments should be
owned by the surrounding composer/application, not serialized as accidental HTML.

## Mentions

The suggestion seam is generic, but structured mentions are a first-class insertion result.

```js
const box = document.querySelector("rich-text");
box.options = {
  suggestions: [
    {
      trigger: "@",
      kind: "mention",
      mentionType: "user",
      async search(query, { signal }) {
        const response = await fetch(`/api/users?q=${encodeURIComponent(query)}`, { signal });
        return response.json();
      },
      getId: (item) => item.id,
      getLabel: (item) => item.name,
    },
  ],
};
```

A selection is stored as ordinary sanitized HTML:

```html
<span data-rt-mention="user" data-id="abc123" contenteditable="false">@Alice Martin</span>
```

The component treats the mention atomically: Backspace/Delete next to it (including across inline wrappers such
as `<b>` and Squire's zero-width caret placeholders) removes it whole and emits `richtext:mentionremove`, and a
selection that starts or ends inside a mention is widened to the whole mention before it is replaced, cut or
dropped. Structured data stays available:

```js
box.richText.getMentions();
// [{ type: "user", id: "abc123", label: "@Alice Martin" }]
```

This is enough for notification/backlink extraction without turning the whole document into a proprietary JSON
schema. If the application starts needing custom document nodes, annotations, nested semantic blocks or
collaboration, that is a signal to use a structured document engine such as Tiptap/ProseMirror or Wordgard rather
than making this package progressively imitate one.

## Slash commands / templates

The same suggestion seam can insert sanitized HTML:

```js
{
  trigger: "/",
  search: (query) => templates.filter((item) => item.label.includes(query)),
  getLabel: (item) => item.label,
  insert: (item) => ({ type: "html", html: item.html }),
}
```

Async suggestion searches are abortable and stale responses are ignored.

## Security

Sanitisation is mandatory. The default allowlist is intentionally narrow:

```text
p br b strong i em ul ol li blockquote a
span[data-rt-mention][data-id][contenteditable]
```

Non-mention spans are unwrapped and a mention label is flattened to plain text. `data-rt-mention`, `data-id`
and `contenteditable` are stripped from every other element (a stray `contenteditable="true"` would otherwise
re-enable editing inside a readonly editor).

Links follow one policy everywhere (initial value, paste, drop, suggestion HTML and the toolbar): relative/hash
URLs and `http:`, `https:`, `mailto:`, `tel:` only. A link with a missing or refused `href` is unwrapped to its
text. The toolbar reports a refused URL with `richtext:linkerror`.

Squire's built-in shortcuts for tags outside the vocabulary (underline, strikethrough, sub/superscript, code)
are disabled so keyboard input cannot produce HTML that the sanitizer would drop on the next load.

The client-side sanitizer is a UI boundary, **not** the persistence security boundary: sanitize/validate HTML again on the server before storing or
rendering untrusted content.

## Form contract

- the authored `<textarea>` owns `name`, `required`, `disabled`, `readonly` and submission; a disabled ancestor
  `<fieldset>` disables the editor too;
- user edits dispatch native `input` on the textarea and `change` when the editor loses focus after a change;
- `form.reset()` restores the authored textarea value and rehydrates Squire;
- an editor containing only Squire's empty block serializes to `""`, so native `required` keeps working;
- native `invalid` emits `richtext:invalid`; the editor takes focus when it is the form's first invalid control
  (the hidden textarea cannot show the native validation bubble, so render your own message on that event);
- external code that changes `textarea.value` can call `richText.sync()` (or dispatch `input`/`change`).

## Toolbar

`toolbar` lists commands in order; `|` starts a group (`role="group"`, rendered as `.rt-group`):

```html
<rich-text toolbar="bold italic | bullet-list ordered-list | link">…</rich-text>
```

Labels and visible content are per-command overrides. A string `content` is rendered as text; a function returns
a Node (an icon), never an HTML string:

```js
box.options = {
  toolbarLabel: "Mise en forme",
  buttons: {
    bold: { label: "Gras", content: "G" },
    link: { label: "Lien", content: () => Object.assign(document.createElement("i"), { className: "ti ti-link" }) },
  },
  // Any async UI (e.g. a <dialog>) can replace window.prompt(); the answer still goes through isSafeHref.
  requestLink: ({ href }) => openLinkDialog(href),
};
```

The toolbar is one tab stop (arrow keys, Home/End move between buttons). Pointer clicks do not move focus out of
the editor, so the selection survives.

## Theming

`rich-text.css` is driven by `--rt-*` custom properties (colours, `--rt-focus-width`, `--rt-min-height`,
`--rt-max-height`, `--rt-font-size`, button pressed/hover, disabled, link, quote, mention and suggestion tokens).
The suggestion popover is appended to `<body>`, outside the editor, so the tokens are declared on both
`.rt-shell` and `.rt-suggestions`: a theme must override them on both.

State hooks: `.rt-shell[data-disabled]`, `.rt-shell[data-readonly]`, `.rt-editor[aria-invalid]` (mirrored from the
textarea), `.rt-editor[data-empty="true"]`, `.rt-button[aria-pressed="true"]`,
`.rt-suggestion[aria-selected="true"]`.

### Actual CSS

The component stays UI-framework agnostic; Actual skins it through a token bridge rather than an adapter.
`demo/actual.html` is the complete, runnable recipe (tokens, invalid hook, composer layout, Tabler icons, `<dialog>`
link editor). The core of it:

```css
.actual-rich-text .rt-shell,
.rt-suggestions {
  --rt-bg: var(--surface);
  --rt-fg: var(--text);
  --rt-border: var(--form-invalid-border, var(--control-border, var(--border)));
  --rt-muted: var(--text-muted);
  --rt-focus: var(--form-invalid-border, var(--focus));
  --rt-focus-width: var(--focus-ring-width);
  --rt-radius: var(--radius);
  --rt-font-size: var(--control-font-size);
  --rt-toolbar-bg: var(--surface-subtle);
  --rt-button-hover: var(--hover-overlay);
  --rt-button-pressed-bg: var(--state-selected);
  --rt-button-pressed-fg: var(--state-selected-fg);
  --rt-disabled-bg: var(--surface-subtle);
  --rt-disabled-fg: var(--state-disabled);
  --rt-link: var(--primary);
  --rt-mention-bg: color-mix(in oklab, var(--surface) var(--soft-bg-mix), var(--primary));
  --rt-mention-fg: color-mix(in oklab, var(--primary) var(--soft-fg-mix), var(--text));
  --rt-suggestion-bg: var(--surface-raised);
  --rt-suggestion-active: var(--hover-overlay);
  --rt-suggestion-shadow: var(--shadow-popout);
}

/* The hidden textarea owns validity: the wrapper re-owns Actual's invalid hook. */
.actual-rich-text:has(textarea[aria-invalid="true"]),
.needs-validation.was-validated .actual-rich-text:has(textarea:invalid) {
  --form-invalid-border: var(--danger);
}
```

Actual still owns presentation and composer chrome (attachments, send, Ctrl/Cmd+Enter); this package owns
rich-text behaviour. Note that Actual's own design notes treat `@`/`/` suggestions as a plain-textarea
improvement; here they are part of the rich editor because mentions are structured, atomic entities.

## Demos

`bun run dev`, then open `http://127.0.0.1:4174/`:

- `demo/index.html` — generic: no CSS framework, async mentions, slash snippets, value/mentions/events inspector,
  toolbar configuration, localisation, native states;
- `demo/actual.html` — the same component inside Actual CSS: theme picker, bridge, composer, states.

## Development

The repository follows the same source-first workflow as `@lekoala/combobox`:

```sh
bun install
bun run check          # syntax + lint + JS typecheck + unit tests
bun run test:browser   # Chromium behavioural pass
bun run sync           # generated dist + declaration files
bun run verify         # final packaging gate
bun run check:all      # full Chromium/Firefox/WebKit matrix
```

Real-browser tests are required for changes involving selection, keyboard behaviour, focus, paste, IME, mentions,
ARIA or form integration.

`bun run sync` regenerates `dist/` (bundles and `dist/types` declarations); never edit it by hand.
