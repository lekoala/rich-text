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

0.1 — first release. Every editing behaviour (mentions, selection, paste, IME, focus, form integration) is covered
by real-browser tests in Chromium, Firefox and WebKit. The API may still change before 1.0.

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
owned by the surrounding composer/application, not serialized as accidental HTML: a paste or drop that carries
files (and no text) inserts nothing and dispatches `richtext:files` instead.

```js
textarea.addEventListener("richtext:files", (event) => {
  const { files, source } = event.detail; // File[], "paste" | "drop"
  composer.attach(files);
});
```

A paste with text stays a text paste even when the clipboard also holds an image (Word and Excel add a rendering
of the selection).

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
<span data-rt-mention="user" data-id="abc123" contenteditable="false">@Alice Martin</span>&nbsp;
```

The inserted mention is followed by a no-break space, so the caret always lands after it (Squire trims a plain
trailing space at the end of a block).

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

Sanitisation is mandatory and not configurable: there is no option to replace or extend the sanitizer, and it is
not exported. The allowlist is intentionally narrow:

```text
p br b strong i em ul ol li blockquote a
span[data-rt-mention][data-id][contenteditable]
```

Non-mention spans are unwrapped and a mention label is flattened to plain text. `data-rt-mention`, `data-id`
and `contenteditable` are stripped from every other element (a stray `contenteditable="true"` would otherwise
re-enable editing inside a readonly editor).

Links follow one policy everywhere (initial value, paste, drop, suggestion HTML and the toolbar): relative/hash
URLs and `http:`, `https:`, `mailto:`, `tel:` only. A link with a missing or refused `href` is unwrapped to its
text. The toolbar reports a refused URL with `richtext:linkerror`. Squire's automatic linking of typed/pasted URLs
is restricted to the same policy (`http(s)`, `www.`/bare domains, e-mail addresses as `mailto:`); `ftp://` stays
plain text.

Before the strict pass, HTML entering the editor (paste, drop, initial value, suggestion HTML) is mapped to
what the vocabulary can express, inside DOMPurify's inert document and after a default DOMPurify pass:

- bold/italic expressed as styles become `b`/`i` (Google Docs spans); a `b`/`strong` styled `font-weight:normal`
  is unwrapped (the Google Docs wrapper that would otherwise make a whole paste bold);
- headings become bold paragraphs; `div`-like wrappers become paragraphs or are unwrapped when they hold blocks;
  `pre` keeps its lines as `<br>`; a table becomes one paragraph per row;
- Word (desktop) list paragraphs become flat `ul`/`ol` lists; a lone paragraph in a list item is unwrapped;
- loose lines become paragraphs (Squire would otherwise create `div` blocks, which are also written as `p` in the
  value).

Pasting a lone URL over selected text links that text, within the link policy.

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
- external code that changes `textarea.value` can call `richText.sync()` (or dispatch `input`/`change`);
- `<rich-text>` follows its textarea when it is moved to another form or fieldset; a bare `RichText` whose
  textarea moved calls `richText.refresh()`.

`form.checkValidity()` and `textarea.checkValidity()` fire `invalid` just like `reportValidity()`, and the
platform gives no way to tell them apart, so they also move focus to the editor when it is the first invalid
control. For a silent check (live validation while typing), read `textarea.validity.valid` instead.

The link dialog is asynchronous (`requestLink` may return a Promise). Its answer is applied to the selection it
was asked for, and dropped if, meanwhile, the editor became readonly/disabled, its content was replaced
(`setHTML`, `sync`, reset), another link request started or the targeted text was removed.

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

`rich-text.css` is driven by `--rt-*` custom properties (colours, `--rt-border` for the field frame and
`--rt-divider` for the toolbar separators, quote bar and popover border, `--rt-focus-width`, `--rt-min-height`,
`--rt-max-height`, `--rt-font-size`, button pressed/hover, disabled, link, quote, mention and suggestion tokens).
The suggestion popover is a child of `.rt-shell` (rendered in the top layer), so it inherits the tokens: a theme
overrides them once, on `.rt-shell` or any ancestor. This also keeps suggestions clickable inside a modal
`<dialog>`.

State hooks: `.rt-shell[data-disabled]`, `.rt-shell[data-readonly]`, `.rt-editor[aria-invalid]` (mirrored from the
textarea), `.rt-editor[data-empty="true"]`, `.rt-button[aria-pressed="true"]`,
`.rt-suggestion[aria-selected="true"]`.

### Actual CSS

The component stays UI-framework agnostic; Actual skins it through a token bridge rather than an adapter.
`demo/actual.html` is the complete, runnable recipe (tokens, invalid hook, composer layout, Tabler icons, `<dialog>`
link editor). The core of it:

```css
.actual-rich-text .rt-shell {
  --rt-bg: var(--surface);
  --rt-fg: var(--text);
  --rt-border: var(--form-invalid-border, var(--control-border, var(--border)));
  --rt-divider: var(--control-border, var(--border));
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

## API

```js
import { RichText, RichTextElement, defineRichText, isSafeHref, DEFAULT_TOOLBAR } from "@lekoala/rich-text";
```

`new RichText(textarea, options)` enhances a textarea without the custom element; `<rich-text>` does the same
declaratively and exposes the instance as `element.richText` (or `await element.whenReady()`).

| Option          | Default           | Description                                                                         |
| --------------- | ----------------- | ----------------------------------------------------------------------------------- |
| `toolbar`       | `DEFAULT_TOOLBAR` | Commands in order, `\|` separates groups, `"none"` hides the toolbar.               |
| `buttons`       | `{}`              | Per-command `{ label, content }` overrides.                                         |
| `toolbarLabel`  | `"Formatting"`    | Accessible name of the toolbar.                                                     |
| `suggestions`   | `[]`              | Suggestion providers (`trigger`, `search`, `kind`, `getLabel`, `getId`, `renderItem`, `insert`, `minChars`, `mentionType`). |
| `requestLink`   | `window.prompt`   | `({ href, text, richText }) => string \| null \| Promise<…>`; `""` removes the link. |

| Method            | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `getHTML()`       | The serialized value (same as `textarea.value`).                            |
| `setHTML(html)`   | Replace the content (sanitized) and update the textarea without `input`.   |
| `sync()`          | Pull an externally changed `textarea.value` into the editor.               |
| `refresh()`       | Re-read form, labels, fieldsets and states after the textarea moved.       |
| `getMentions()`   | `{ type, id, label }[]` in document order.                                 |
| `insertMention()` | Insert `{ id, label, type? }` at the selection.                            |
| `focus()`         | Focus the editor.                                                          |
| `dispose()`       | Remove the generated UI and listeners, restore the textarea. Idempotent.   |

Events are dispatched on the textarea and bubble: native `input`/`change`, and `richtext:invalid`,
`richtext:files`, `richtext:linkerror`, `richtext:mentionselect`, `richtext:mentionremove`,
`richtext:suggestionerror`. The custom
element dispatches `richtext:ready`.

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
