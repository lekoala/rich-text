# Contributing

Read `AGENTS.md` first.

For behavior changes:

1. state the product use case;
2. keep the textarea as the native source of truth;
3. do not work around Squire by reimplementing contenteditable behavior;
4. add a browser regression test for selection/focus/form/a11y/IME/paste changes;
5. update README/API examples when the public contract changes;
6. keep unrelated cleanup separate.

Use `bun run check` during implementation and `bun run verify` as the final package gate.
