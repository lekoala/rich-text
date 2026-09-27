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
<label for="note">Consultation note</label>
<rich-text>
  <textarea id="note" name="note" required></textarea>
</rich-text>
```

Without JavaScript the textarea remains a normal textarea. With JavaScript it is hidden and stays the native
form-value owner; the component never invents a second serialized form state.

Importing `@lekoala/rich-text` has no registration side effect. Consumers can either call `defineRichText()` or
import `@lekoala/rich-text/define` explicitly.

## Default scope

The default toolbar is intentionally small:

```text
bold italic bullet-list ordered-list link blockquote undo redo
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
      mentionType: "practitioner",
      async search(query, { signal }) {
        const response = await fetch(`/api/practitioners?q=${encodeURIComponent(query)}`, { signal });
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
<span data-rt-mention="practitioner" data-id="abc123" contenteditable="false">@Dr Martin</span>
```

The component treats the mention atomically for adjacent Backspace/Delete and exposes structured data:

```js
box.richText.getMentions();
// [{ type: "practitioner", id: "abc123", label: "@Dr Martin" }]
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

Non-mention spans are unwrapped. `javascript:`/`data:` links are removed. The client-side sanitizer is a UI
boundary, **not** the persistence security boundary: sanitize/validate HTML again on the server before storing or
rendering untrusted content.

## Form contract

- the authored `<textarea>` owns `name`, `required`, `disabled`, `readonly` and submission;
- user edits dispatch native `input` on the textarea and `change` when the editor loses focus after a change;
- `form.reset()` restores the authored textarea value and rehydrates Squire;
- an editor containing only Squire's empty block serializes to `""`, so native `required` keeps working;
- native `invalid` is redirected to the visible editor and emits `richtext:invalid`;
- external code that changes `textarea.value` can call `richText.sync()` (or dispatch `input`/`change`).

## Actual CSS bridge

The component is UI-framework agnostic. Actual can skin it through a small token bridge rather than an adapter:

```css
.actual-rich-text .rt-shell {
  --rt-bg: var(--surface);
  --rt-fg: var(--text);
  --rt-border: var(--form-invalid-border, var(--border));
  --rt-focus: var(--focus);
  --rt-radius: var(--radius);
  --rt-toolbar-bg: var(--surface-subtle);
  --rt-mention-bg: color-mix(in oklab, var(--surface) var(--soft-bg-mix), var(--primary));
  --rt-suggestion-bg: var(--surface-raised);
}
```

Actual still owns presentation; this package owns rich-text behaviour.

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

> Prototype note: this archive intentionally does not include `bun.lock` or generated `dist/`. Run `bun install` once, commit the lockfile, then `bun run sync` to generate release artifacts.
