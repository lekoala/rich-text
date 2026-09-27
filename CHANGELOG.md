# Changelog

## Unreleased

- Form reset from a real click now resets the editor on the first click (the sync ran before the controls were reset).
- Hovering a pressed toolbar button overlays `--rt-button-hover` instead of replacing its background, so the pressed
  background and `--rt-button-pressed-fg` stay readable together.
- Toolbar group separators close a group instead of opening the next one, so a wrapped line starts with buttons.
- New `--rt-divider` token for the toolbar separators, quote bar and popover border. `--rt-border` now paints only the
  field frame, so an invalid/state override of it no longer turns the inner lines red.

## 0.1.0

First release.

- Progressive enhancement of a `<textarea>`, which stays the form-value owner (input/change, reset, required,
  disabled/readonly, disabled fieldsets, `invalid`).
- Small grouped toolbar with configurable labels/content, one tab stop, selection-preserving pointer use.
- Mandatory, non-configurable sanitizer (DOMPurify + the component's own policy); one link policy for values, paste,
  suggestions, the toolbar and Squire's URL auto-detection.
- Structured, atomic `@mentions` and generic caret suggestions (async-safe, IME-aware); the popover lives in the
  editor shell, so it works inside modal dialogs and inherits the instance theme.
- Async link dialog guarded against stale context (readonly switch, content replacement, moved selection).
- `<rich-text>` lifecycle element: rebinds on textarea replacement and follows its textarea across forms/fieldsets.
