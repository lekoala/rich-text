# AGENTS.md

## Mission

Build a small, opinionated rich-text form control around Squire. Do not build a new WYSIWYG engine.

## Invariants

- The authored `<textarea>` is always the form-value owner.
- Squire owns contenteditable editing rules, selection, history, paste normalisation and browser quirks. Never fork or
  copy Squire internals into this package.
- `<rich-text>` is a declarative lifecycle boundary only. It has no Shadow DOM and is not form-associated.
- Importing normal source modules never registers a custom element. `src/define.js` is the side-effect entry.
- Sanitisation is mandatory. Unsafe raw HTML must never be inserted through a bypass path.
- The default HTML vocabulary stays deliberately small. Images, tables, arbitrary styles/fonts/colors, embeds and
  attachments are not default editor features.
- A structured mention is an atomic inline entity with stable identity:
  `<span data-rt-mention="type" data-id="id" contenteditable="false">label</span>`.
  The label is presentation; `type + id` is identity.
- Mention deletion must be atomic at adjacent Backspace/Delete boundaries. Browser tests across Chromium, Firefox and
  WebKit are mandatory for any change touching mentions or selection.
- Suggestion providers are async-safe: previous searches are aborted and stale results never render.
- Suggestion strings are rendered as text. Rich suggestion rows return DOM Nodes.
- HTML insertion from suggestion providers still goes through Squire's configured sanitizer.
- IME composition suppresses suggestion navigation/querying until composition ends.
- `input` mirrors user changes to the textarea; `change` is dispatched after a focus session if the value changed.
- An editor that is visually empty serializes to the empty string so native `required` semantics remain useful.
- `form.reset()` rehydrates the editor from the native textarea reset value.
- Anything generated outside the component subtree (the suggestion popover, generated label ids) is removed/restored by
  `dispose()`.
- `disabled` and `readonly` remain authored on the textarea and are mirrored to the editor UI.
- Links accept only relative/hash URLs and http/https/mailto/tel schemes by default.

## Non-goals

Do not add without a concrete current product requirement:

- an editor-engine abstraction/provider interface;
- ProseMirror/Lexical-style custom node schemas;
- collaborative editing;
- comments/track changes;
- tables;
- image uploads or base64 pasted images;
- arbitrary font family/size/color controls;
- a plugin architecture;
- a second hidden serialized model alongside the textarea.

If those needs become central, reassess the engine instead of growing Squire into a structured-document framework.

## Working style

- Prefer explicit contracts over generic abstractions.
- Keep the source ESM readable before optimizing bundle size.
- Unit-test pure helpers; use real browsers for editing behavior.
- Any bug involving caret/selection, focus, keyboard, paste, IME, ARIA, popovers, form reset or mentions gets a browser
  regression test.
- During implementation run `bun run check`; run targeted browser tests for the changed behavior. Regenerate dist only
  when the source change is stable.
- Never hand-edit generated `dist/` declaration or bundle files.

## Definition of done

A behavior is not done until:

1. textarea fallback remains valid;
2. form value/reset/disabled/readonly behavior is correct;
3. sanitizer behavior is explicit;
4. keyboard and selection behavior are specified;
5. async cancellation/error behavior is considered;
6. browser tests cover the normal path plus an edge case;
7. `dispose()` leaves no generated surface/listener/popover behind.
