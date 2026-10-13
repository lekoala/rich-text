import { expect, test } from "@playwright/test";

// Trace screenshots hide the caret by mutating the focused surface's style, which Squire records as an edit.
test.use({ trace: { mode: "retain-on-failure", screenshots: false, snapshots: true } });

async function open(page) {
  await page.goto("/test/fixtures/playground.html");
  await page.waitForFunction(() => window.fixtureReady);
}

test.afterEach(async ({ page }) => {
  expect(await page.evaluate(() => window.pageErrors)).toEqual([]);
});

for (const state of ["readOnly", "disabled", "fieldset"]) {
  test(`${state} blocks selected-text edits, history, clipboard, drop and API insertion`, async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => mount({ html: "<p>Hello world</p>", fieldset: true }));
    await page.evaluate(() => caretIn("Hello world", 11));
    await page.keyboard.type("!");
    await expect(page.locator("#note")).toHaveValue("<p>Hello world!</p>");
    await page.evaluate((state) => {
      if (state === "fieldset") document.querySelector("fieldset").disabled = true;
      else rt.source[state] = true;
    }, state);
    await expect(page.locator(".rt-editor")).toHaveAttribute("contenteditable", "false");
    await page.evaluate(() => {
      rt.surface.focus();
      const range = document.createRange();
      range.setStart(rt.surface.firstChild.firstChild, 6);
      range.setEnd(rt.surface.firstChild.firstChild, 11);
      rt.squire.setSelection(range);
      window.events = [];
    });
    for (const key of [
      "x",
      "Backspace",
      "Delete",
      "Control+x",
      "Control+v",
      "Control+z",
      "Control+b",
      "Meta+z",
      "Meta+b",
      "Control+Shift+8",
      "Enter",
    ]) {
      await page.keyboard.press(key);
    }
    const canceled = await page.evaluate(() => {
      const results = [];
      for (const type of ["cut", "paste", "drop"]) {
        const data = new DataTransfer();
        data.setData("text/plain", "REPLACED");
        const event =
          type === "drop"
            ? new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data })
            : new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: data });
        results.push(!rt.surface.dispatchEvent(event));
      }
      results.push(
        !rt.surface.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertText",
            data: "x",
          }),
        ),
      );
      rt.insertMention({ id: "1", label: "@Alice" });
      return results;
    });
    expect(canceled).toEqual([true, true, true, true]);
    await expect(page.locator("#note")).toHaveValue("<p>Hello world!</p>");
    await expect(page.locator(".rt-editor")).toHaveText("Hello world!");
    expect(await page.evaluate(() => events.filter((type) => type === "input"))).toEqual([]);
    expect(
      await page.evaluate(() => {
        return ["ArrowRight", "Tab", "c", "a"].map((key) => {
          const event = new KeyboardEvent("keydown", {
            key,
            ctrlKey: key.length === 1,
            bubbles: true,
            cancelable: true,
          });
          return rt.surface.dispatchEvent(event);
        });
      }),
    ).toEqual([true, true, true, true]);
    await page.evaluate((state) => {
      if (state === "fieldset") document.querySelector("fieldset").disabled = false;
      else rt.source[state] = false;
    }, state);
    await expect(page.locator(".rt-editor")).toHaveAttribute("contenteditable", "true");
    await page.evaluate(() => caretIn("Hello world!", 12));
    await page.keyboard.type("?");
    await expect(page.locator("#note")).toHaveValue("<p>Hello world!?</p>");
  });
}

for (const setting of ["toolbar", "options"]) {
  test(`${setting} rebuild emits change and restores selected text and focus`, async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      defineRichText();
      document.querySelector("#root").innerHTML =
        '<rich-text id="host"><textarea id="note"><p>Hello</p></textarea></rich-text>';
      window.rt = await document.querySelector("#host").whenReady();
      window.events = [];
      rt.source.addEventListener("change", () => events.push("change"));
      caretIn("Hello", 5);
    });
    await page.keyboard.type("!");
    await expect(page.locator("#note")).toHaveValue("<p>Hello!</p>");
    await page.evaluate((setting) => {
      const range = document.createRange();
      range.setStart(rt.surface.firstChild.firstChild, 1);
      range.setEnd(rt.surface.firstChild.firstChild, 4);
      rt.squire.setSelection(range);
      const host = document.querySelector("#host");
      if (setting === "toolbar") host.setAttribute("toolbar", "bold undo redo");
      else host.options = { toolbar: "bold undo redo" };
    }, setting);
    await expect(page.locator(".rt-editor")).toBeFocused();
    expect(await page.evaluate(() => document.querySelector("#host").richText.squire.getSelectedText())).toBe(
      "ell",
    );
    expect(await page.evaluate(() => events)).toEqual(["change"]);
    await expect(page.locator('[data-command="undo"]')).toBeDisabled();
    await page.locator("#outside").focus();
    expect(await page.evaluate(() => events)).toEqual(["change"]);
    await page.evaluate(() => {
      const host = document.querySelector("#host");
      host.dispose();
      host.dispose();
    });
    await expect(page.locator(".rt-shell")).toHaveCount(0);
    await expect(page.locator("#note")).toBeVisible();
  });
}

for (const replacement of ["setHTML", "sync", "reset"]) {
  test(`${replacement} resets undo and redo toolbar state`, async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: "<p>Hello</p>" }));
    await page.evaluate(() => caretIn("Hello", 5));
    await page.keyboard.type("!");
    await expect(page.locator('[data-command="undo"]')).toBeEnabled();
    await page.evaluate((replacement) => {
      if (replacement === "setHTML") rt.setHTML("<p>Next</p>");
      else if (replacement === "sync") {
        rt.source.value = "<p>Next</p>";
        rt.sync();
      } else document.querySelector("#form").reset();
    }, replacement);
    await expect(page.locator('[data-command="undo"]')).toBeDisabled();
    await expect(page.locator('[data-command="redo"]')).toBeDisabled();
    await expect(page.locator("#note")).toHaveValue(replacement === "reset" ? "<p>Hello</p>" : "<p>Next</p>");
  });
}

test("rejected link dialog reports an error; stale rejection after replacement is ignored", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() =>
    mount({
      html: "<p>Hello</p>",
      options: {
        requestLink: () => Promise.reject(new Error("dialog closed")),
      },
    }),
  );
  await page.evaluate(() => caretIn("Hello", 5));
  await page.locator('[data-command="link"]').click();
  await expect.poll(() => page.evaluate(() => events)).toContain("richtext:linkerror");
  await expect(page.locator("#note")).toHaveValue("<p>Hello</p>");
  await page.evaluate(() => {
    rt.options.requestLink = () =>
      new Promise((_resolve, reject) => {
        window.rejectLink = reject;
      });
    window.events = [];
  });
  await page.locator('[data-command="link"]').click();
  await page.evaluate(() => {
    rt.setHTML("<p>Next</p>");
    rejectLink(new Error("stale"));
  });
  expect(await page.evaluate(() => events)).toEqual([]);
});

for (const invalid of ["id", "label", "throw"]) {
  test(`invalid suggestion ${invalid} reports error without losing the query or rows`, async ({ page }) => {
    await open(page);
    await page.evaluate(
      (invalid) =>
        mount({
          options: {
            suggestions: [
              {
                trigger: "@",
                kind: "mention",
                search: () => [{ id: "1", label: "Alice" }],
                getId: () => (invalid === "id" ? "" : "1"),
                insert:
                  invalid === "id"
                    ? undefined
                    : () => {
                        if (invalid === "throw") throw new Error("provider failed");
                        return {
                          type: "mention",
                          id: invalid === "id" ? "" : "1",
                          label: invalid === "label" ? " " : "@Alice",
                        };
                      },
              },
            ],
          },
        }),
      invalid,
    );
    await page.locator(".rt-editor").focus();
    await page.keyboard.type("@no");
    await expect(page.locator('[role="option"]')).toBeVisible();
    await page.keyboard.press("Enter");
    await expect.poll(() => page.evaluate(() => events)).toContain("richtext:suggestionerror");
    await expect(page.locator("#note")).toHaveValue("<p>@no</p>");
    await expect(page.locator('[role="option"]')).toBeVisible();
    await page.evaluate(() => {
      rt.options.suggestions[0].insert = () => ({ type: "mention", id: "1", label: "@Alice" });
    });
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-rt-mention]")).toHaveText("@Alice");
    await page.evaluate(() => rt.dispose());
    await expect(page.locator(".rt-shell")).toHaveCount(0);
  });
}

test("sanitizer normalizes orphan items, list content, rules and protocol-relative links", async ({
  page,
}) => {
  await open(page);
  await page.evaluate(() => mount());
  for (const [input, output] of [
    ["<li>loose</li><li>next</li>", "<ul><li>loose</li><li>next</li></ul>"],
    ["<ul>text<li>a</li><b>end</b></ul>", "<ul><li>text</li><li>a</li><li><b>end</b></li></ul>"],
    ["<ul><li>a<ul><li>b</li></ul></li></ul>", "<ul><li><p>a</p><ul><li>b</li></ul></li></ul>"],
    ["<hr>", ""],
    [
      '<p><a href="//evil.example">unsafe</a> <a href="/safe">safe</a></p>',
      '<p>unsafe <a href="/safe">safe</a></p>',
    ],
  ]) {
    await page.evaluate((input) => rt.setHTML(input), input);
    await expect(page.locator("#note")).toHaveValue(output);
    await page.evaluate(() => rt.setHTML(rt.value));
    await expect(page.locator("#note")).toHaveValue(output);
  }
});

test("rebuild keeps toolbar focus and does not steal outside focus", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    defineRichText();
    document.querySelector("#root").innerHTML =
      '<rich-text id="host"><textarea id="note"><p>Hello</p></textarea></rich-text>';
    window.rt = await document.querySelector("#host").whenReady();
  });
  await page.locator('[data-command="bold"]').focus();
  await page.evaluate(() => {
    document.querySelector("#host").options = { toolbar: "italic bold" };
  });
  await expect(page.locator('[data-command="bold"]')).toBeFocused();
  await page.locator("#outside").focus();
  await page.evaluate(() => {
    document.querySelector("#host").options = { toolbar: "bold" };
  });
  await expect(page.locator("#outside")).toBeFocused();
});

test("replacement clears redo history and cancels pending suggestions", async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    mount({
      html: "<p>Hello</p>",
      options: {
        suggestions: [
          {
            trigger: "@",
            kind: "mention",
            search: (_query, context) => {
              window.searchSignal = context.signal;
              return new Promise((resolve) => {
                window.resolveSearch = resolve;
              });
            },
          },
        ],
      },
    }),
  );
  await page.evaluate(() => caretIn("Hello", 5));
  await page.keyboard.type(" @no");
  await expect.poll(() => page.evaluate(() => Boolean(window.resolveSearch))).toBe(true);
  await page.evaluate(() => rt.setHTML("<p>Next</p>"));
  expect(await page.evaluate(() => searchSignal.aborted)).toBe(true);
  await page.evaluate(() => resolveSearch([{ id: "1", label: "Alice" }]));
  await expect(page.locator('[role="option"]')).toHaveCount(0);
  await page.evaluate(() => caretIn("Next", 4));
  await page.keyboard.type("!");
  await expect(page.locator('[data-command="undo"]')).toBeEnabled();
  await page.locator('[data-command="undo"]').click();
  await expect(page.locator('[data-command="redo"]')).toBeEnabled();
  await page.evaluate(() => rt.setHTML("<p>Replaced</p>"));
  await expect(page.locator('[data-command="undo"]')).toBeDisabled();
  await expect(page.locator('[data-command="redo"]')).toBeDisabled();
});
