import { expect, test } from "@playwright/test";

/** @param {import("@playwright/test").Page} page */
async function open(page) {
  await page.goto("/test/fixtures/playground.html");
  await page.waitForFunction(() => window.fixtureReady);
}

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === "skipped") return;
  expect(await page.evaluate(() => window.pageErrors)).toEqual([]);
});

test.describe("form contract", () => {
  test("mounting and state attributes never count as user edits", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: "<p>Hello</p>", attrs: { required: true } }));
    await page.evaluate(() => document.querySelector("#note").setAttribute("aria-invalid", "true"));
    await expect(page.locator(".rt-editor")).toHaveAttribute("aria-invalid", "true");
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.events)).toEqual([]);
    expect(await page.locator("#note").inputValue()).toBe("<p>Hello</p>");
  });

  test("change fires once after a focus session that edited the value", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: "<p>Hello</p>" }));
    await page.evaluate(() => caretIn("Hello", 5));
    await page.keyboard.type("!");
    await page.locator("#outside").focus();
    await expect
      .poll(() => page.evaluate(() => window.events.filter((type) => type === "change")))
      .toEqual(["change"]);

    await page.evaluate(() => caretIn("Hello!", 0));
    await page.locator("#outside").focus();
    await page.waitForTimeout(50);
    expect(await page.evaluate(() => window.events.filter((type) => type === "change").length)).toBe(1);
  });

  test("readonly keeps mentions and value intact", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: `<p>x${MENTION}</p>`, attrs: { readonly: true } }));
    await expect(page.locator(".rt-editor")).toHaveAttribute("contenteditable", "false");
    const before = await page.locator("#note").inputValue();
    await page.evaluate(() => caretIn("x", 1));
    // Delete, not Backspace: outside an editable host WebKit maps Backspace to history.back().
    await page.keyboard.press("Delete");
    await page.keyboard.type("z");
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveCount(1);
    expect(await page.locator("#note").inputValue()).toBe(before);
    await expect(page.locator('[data-command="bold"]')).toBeDisabled();
  });

  test("a disabled fieldset disables the editor and re-enables it", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: "<p>Hello</p>", fieldset: true }));
    const editor = page.locator(".rt-editor");
    await expect(editor).toHaveAttribute("contenteditable", "true");

    await page.evaluate(() => {
      document.querySelector("fieldset").disabled = true;
    });
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await expect(editor).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator('[data-command="bold"]')).toBeDisabled();

    await page.evaluate(() => {
      document.querySelector("fieldset").disabled = false;
    });
    await expect(editor).toHaveAttribute("contenteditable", "true");
  });

  test("a <rich-text> moved to another form follows its reset and fieldset", async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      defineRichText();
      document.querySelector("#root").innerHTML =
        '<form id="old"><rich-text id="host"><textarea name="a"><p>Initial</p></textarea></rich-text></form>' +
        '<form id="next"><fieldset disabled></fieldset></form>';
      const richText = await document.querySelector("#host").whenReady();
      richText.setHTML("<p>Changed</p>");
      document.querySelector("#next fieldset").append(document.querySelector("#host"));
    });
    const editor = page.locator("#host .rt-editor");
    await expect(editor).toHaveAttribute("contenteditable", "false");
    await expect(editor).toHaveAttribute("aria-disabled", "true");

    await page.evaluate(() => {
      document.querySelector("#next fieldset").disabled = false;
    });
    await expect(editor).toHaveAttribute("contenteditable", "true");

    await page.evaluate(() => document.querySelector("#next").reset());
    await expect(editor).toHaveText("Initial");
    await expect(page.locator("#host textarea")).toHaveValue("<p>Initial</p>");
  });

  test("invalid focuses the editor only when it is the first invalid control", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ attrs: { required: true } }));
    await page.evaluate(() => document.querySelector("#form").requestSubmit());
    await expect(page.locator(".rt-editor")).toBeFocused();
    expect(await page.evaluate(() => window.events)).toContain("richtext:invalid");

    await page.evaluate(() => mount({ attrs: { required: true }, before: '<input id="first" required>' }));
    await page.evaluate(() => document.querySelector("#form").requestSubmit());
    await expect(page.locator("#first")).toBeFocused();
    expect(await page.evaluate(() => window.events)).toContain("richtext:invalid");
  });
});

test.describe("sanitizer", () => {
  test("applies the toolbar link policy and strips mention attributes elsewhere", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      mount({
        html:
          '<p contenteditable="true" data-id="x">' +
          '<a href="https://ok.test">ok</a> <a href="vbscript:msgbox(1)">vb</a> <a href="ftp://x.test">ftp</a> ' +
          '<a href=" JaVaScRiPt:alert(1)">js</a> <a href="/rel">rel</a> <a>bare</a> ' +
          '<span data-rt-mention="person" data-id="p1" contenteditable="true" title="t"><b>@Ann</b></span>' +
          "</p>",
      }),
    );
    const value = await page.locator("#note").inputValue();
    expect(value).toContain('href="https://ok.test"');
    expect(value).toContain('href="/rel"');
    expect(value).not.toMatch(/vbscript|ftp:|javascript|<a>/i);
    expect(value).toContain("vb");
    expect(value).toContain(
      '<span data-rt-mention="person" data-id="p1" contenteditable="false">@Ann</span>',
    );
    expect(value).not.toContain('contenteditable="true"');
    expect(value).not.toMatch(/<p [^>]*data-id/);
  });

  test("inline styles written into the live editor never reach the value", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: `<p>a ${MENTION} style="x"</p>` }));
    await page.evaluate(() => {
      rt.surface.querySelector("p").style.color = "red";
      rt.surface.querySelector("[data-rt-mention]").style.caretColor = "transparent";
    });
    await page.evaluate(() => caretIn(' style="x"', 10));
    await page.keyboard.type("!");
    await expect(page.locator("#note")).toHaveValue(
      '<p>a <span data-rt-mention="person" data-id="p1" contenteditable="false">@Ann</span> style="x"!</p>',
    );
  });

  test("paste goes through the sanitizer", async ({ page, browserName }) => {
    test.skip(browserName === "firefox", "Firefox ignores clipboardData on synthetic paste events");
    await open(page);
    await page.evaluate(() => mount({ html: "<p>Start</p>" }));
    await page.evaluate(() => caretIn("Start", 5));
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData(
        "text/html",
        '<p> <a href="vbscript:x">bad</a> <u>under</u><img src="x" onerror="window.XSS=1"><script>window.XSS=1</script></p>',
      );
      data.setData("text/plain", " bad under");
      rt.surface.dispatchEvent(
        new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
      );
    });
    await expect(page.locator(".rt-editor")).toContainText("under");
    const value = await page.locator("#note").inputValue();
    expect(value).not.toMatch(/vbscript|<u>|<img|<script|onerror/);
    expect(await page.evaluate(() => window.XSS)).toBeUndefined();
  });

  test("typed URLs are auto-linked only within the link policy", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount());
    await page.locator(".rt-editor").click();
    await page.keyboard.type("ftp://files.test and https://ok.test done");
    await expect(page.locator(".rt-editor a")).toHaveCount(1);
    await expect(page.locator(".rt-editor a")).toHaveAttribute("href", "https://ok.test");
    expect(await page.locator("#note").inputValue()).not.toContain('href="ftp:');
  });

  test("the sanitizer cannot be replaced through options", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      mount({
        html: '<p onclick="window.XSS=1">Hello</p>',
        options: {
          sanitizeToDOMFragment(html) {
            const template = document.createElement("template");
            template.innerHTML = html;
            return template.content;
          },
        },
      }),
    );
    await page.locator(".rt-editor p").click();
    await expect(page.locator("#note")).toHaveValue("<p>Hello</p>");
    expect(await page.evaluate(() => window.XSS)).toBeUndefined();
  });

  test("Squire shortcuts outside the vocabulary are disabled", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: "<p>Hello</p>" }));
    await page.evaluate(() => {
      const range = document.createRange();
      range.selectNodeContents(rt.surface.querySelector("p"));
      rt.squire.focus();
      rt.squire.setSelection(range);
    });
    for (const key of ["Control+u", "Meta+u", "Control+Shift+7", "Control+Shift+5", "Control+Shift+6"]) {
      await page.keyboard.press(key);
    }
    expect(await page.locator("#note").inputValue()).toBe("<p>Hello</p>");
  });
});

test.describe("links", () => {
  /** @param {import("@playwright/test").Page} page */
  async function mountLinks(page) {
    await open(page);
    await page.evaluate(() =>
      mount({
        html: '<p>Go <a href="https://a.test">here</a> now</p>',
        options: { requestLink: () => window.nextLink },
      }),
    );
  }

  test("edits the existing link from a collapsed caret", async ({ page }) => {
    await mountLinks(page);
    await page.evaluate(() => {
      window.nextLink = "https://b.test";
      caretIn("here", 2);
    });
    await page.locator('[data-command="link"]').click();
    await expect(page.locator(".rt-editor a")).toHaveAttribute("href", "https://b.test");
    await expect(page.locator(".rt-editor a")).toHaveText("here");
    await expect(page.locator(".rt-editor")).toHaveText("Go here now");
  });

  test("an empty answer removes the link around the caret", async ({ page }) => {
    await mountLinks(page);
    await page.evaluate(() => {
      window.nextLink = "";
      caretIn("here", 2);
    });
    await page.locator('[data-command="link"]').click();
    await expect(page.locator(".rt-editor a")).toHaveCount(0);
    await expect(page.locator(".rt-editor")).toHaveText("Go here now");
  });

  test("an async answer applies to the selection it was asked for", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      mount({
        html: "<p>Hello world</p>",
        options: { requestLink: () => new Promise((resolve) => (window.resolveLink = resolve)) },
      });
      caretIn("Hello world", 0);
      const range = rt.squire.getSelection();
      range.setEnd(range.startContainer, 5);
      rt.squire.setSelection(range);
    });
    await page.locator('[data-command="link"]').click();
    await page.evaluate(() => {
      caretIn("Hello world", 11);
      window.resolveLink("https://a.test");
    });
    await expect(page.locator(".rt-editor a")).toHaveText("Hello");
    await expect(page.locator("#note")).toHaveValue('<p><a href="https://a.test">Hello</a> world</p>');
  });

  test("an async answer is dropped after readonly, content replacement or a newer request", async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => {
      window.resolvers = [];
      mount({
        html: "<p>Hello</p>",
        options: { requestLink: () => new Promise((resolve) => window.resolvers.push(resolve)) },
      });
      caretIn("Hello", 2);
    });
    const button = page.locator('[data-command="link"]');

    await button.click();
    await page.evaluate(() => {
      rt.source.readOnly = true;
      window.resolvers[0]("https://a.test");
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => {
      rt.source.readOnly = false;
      caretIn("Hello", 2);
    });

    await button.click();
    await page.evaluate(() => {
      rt.setHTML("<p>Hello</p>");
      window.resolvers[1]("https://b.test");
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => caretIn("Hello", 2));

    await button.click();
    await button.click();
    await page.evaluate(() => {
      window.resolvers[2]("https://stale.test");
      window.resolvers[3]("https://c.test");
    });
    // Only the newest answer lands (from a bare caret, Squire inserts the URL as the link text).
    await expect(page.locator(".rt-editor a")).toHaveCount(1);
    await expect(page.locator(".rt-editor a")).toHaveAttribute("href", "https://c.test");
  });

  for (const state of ["readonly", "disabled", "fieldset"]) {
    test(`an async answer stays cancelled after ${state} is cleared`, async ({ page }) => {
      await open(page);
      await page.evaluate((state) => {
        mount({
          html: "<p>Hello</p>",
          fieldset: state === "fieldset",
          options: { requestLink: () => new Promise((resolve) => (window.resolveLink = resolve)) },
        });
        caretIn("Hello", 2);
      }, state);
      const button = page.locator('[data-command="link"]');
      await button.click();

      const target = page.locator(state === "fieldset" ? "fieldset" : "#note");
      const attribute = state === "readonly" ? "readonly" : "disabled";
      await target.evaluate((node, attribute) => node.setAttribute(attribute, ""), attribute);
      await expect(button).toBeDisabled();
      await target.evaluate((node, attribute) => node.removeAttribute(attribute), attribute);
      await expect(button).toBeEnabled();

      await page.evaluate(async () => {
        window.resolveLink("https://stale.test");
        await Promise.resolve();
      });
      await expect(page.locator(".rt-editor a")).toHaveCount(0);
      await expect(page.locator("#note")).toHaveValue("<p>Hello</p>");
      expect(await page.evaluate(() => window.events)).not.toContain("input");

      // Re-enabling still allows a newly requested link.
      await page.evaluate(() => caretIn("Hello", 2));
      await button.click();
      await page.evaluate(() => window.resolveLink("https://fresh.test"));
      await expect(page.locator(".rt-editor a")).toHaveAttribute("href", "https://fresh.test");
    });
  }

  test("refuses unsafe schemes with richtext:linkerror", async ({ page }) => {
    await mountLinks(page);
    await page.evaluate(() => {
      window.nextLink = "javascript:alert(1)";
      caretIn("here", 2);
    });
    await page.locator('[data-command="link"]').click();
    await expect.poll(() => page.evaluate(() => window.events)).toContain("richtext:linkerror");
    await expect(page.locator(".rt-editor a")).toHaveAttribute("href", "https://a.test");
  });
});

test.describe("mentions", () => {
  test("Backspace removes a mention across an inline wrapper", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: `<p><b>${MENTION}</b>x</p>` }));
    await page.evaluate(() => caretIn("x", 0));
    await page.keyboard.press("Backspace");
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveCount(0);
    await expect(page.locator(".rt-editor")).toHaveText("x");
    await expect(page.locator("#note")).not.toHaveValue(/data-rt-mention/);
    expect(await page.evaluate(() => window.events)).toContain("richtext:mentionremove");
  });

  test("Backspace skips zero-width caret placeholders", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: `<p>${MENTION}tail</p>` }));
    await page.evaluate(() => {
      const tail = [...rt.surface.querySelector("p").childNodes].find((node) => node.data === "tail");
      const wrapper = document.createElement("i");
      wrapper.append("​");
      tail.before(wrapper);
      caretIn("tail", 0);
    });
    await page.keyboard.press("Backspace");
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveCount(0);
    await expect(page.locator(".rt-editor")).toContainText("tail");
  });

  test("Delete removes the following mention", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: `<p>a${MENTION}b</p>` }));
    await page.evaluate(() => caretIn("a", 1));
    await page.keyboard.press("Delete");
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveCount(0);
    await expect(page.locator(".rt-editor")).toHaveText("ab");
  });

  test("Backspace after visible text deletes only the text", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: `<p>${MENTION} xy</p>` }));
    await page.evaluate(() => caretIn(" xy", 3));
    await page.keyboard.press("Backspace");
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveCount(1);
    await expect(page.locator(".rt-editor")).toHaveText("@Ann x");
  });

  test("Backspace at a block start merges blocks instead of removing the previous mention", async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => mount({ html: `<p>${MENTION}</p><p>x</p>` }));
    await page.evaluate(() => caretIn("x", 0));
    await page.keyboard.press("Backspace");
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveCount(1);
    await expect(page.locator(".rt-editor")).toContainText("x");
  });

  test("typing after a mention picked at the end of a block continues after it", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      mount({
        options: {
          suggestions: [{ trigger: "@", kind: "mention", search: () => [{ id: "a", name: "Alice" }] }],
        },
      }),
    );
    await page.locator(".rt-editor").click();
    await page.keyboard.type("@");
    await page.locator(".rt-suggestion").click();
    await page.keyboard.type("hi");
    await expect(page.locator("#note")).toHaveValue(
      '<p><span data-rt-mention="mention" data-id="a" contenteditable="false">@Alice</span>&nbsp;hi</p>',
    );
    await expect(page.locator(".rt-suggestion")).toHaveCount(0);
  });

  test("removal is undoable", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: `<p>a${MENTION}b</p>` }));
    await page.evaluate(() => caretIn("b", 0));
    await page.keyboard.press("Backspace");
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveCount(0);
    await page.evaluate(() => rt.squire.undo());
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveCount(1);
    await expect(page.locator("#note")).toHaveValue(/data-id="p1"/);
  });

  test("a selection that starts inside a mention replaces the whole mention", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: `<p>a${MENTION}bc</p>` }));
    await page.evaluate(() => {
      const label = rt.surface.querySelector("[data-rt-mention]").firstChild;
      const after = [...rt.surface.querySelector("p").childNodes].find((node) => node.data === "bc");
      const range = document.createRange();
      range.setStart(label, 2);
      range.setEnd(after, 1);
      rt.squire.focus();
      rt.squire.setSelection(range);
    });
    await page.keyboard.type("z");
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveCount(0);
    // WebKit clips the native selection to the mention itself, so "b" may survive; the mention never does.
    await expect(page.locator(".rt-editor")).toHaveText(/^azb?c$/);
    await expect(page.locator("#note")).not.toHaveValue(/data-rt-mention|@A|nn/);
  });
});

test.describe("suggestions", () => {
  test("aborts superseded searches, searches each query once and never renders stale rows", async ({
    page,
  }) => {
    await open(page);
    await page.evaluate(() => {
      window.calls = [];
      mount({
        options: {
          suggestions: [
            {
              trigger: "@",
              kind: "mention",
              minChars: 1,
              search(query, { signal }) {
                window.calls.push({ query, signal });
                const delay = query === "a" ? 1000 : 20;
                return new Promise((resolve) =>
                  setTimeout(() => resolve([{ id: query, name: `Res ${query}` }]), delay),
                );
              },
            },
          ],
        },
      });
    });
    await page.locator(".rt-editor").click();
    await page.keyboard.type("@a");
    await page.keyboard.type("b");
    await expect(page.locator(".rt-suggestion")).toHaveText(["Res ab"]);
    await page.waitForTimeout(1100);
    await expect(page.locator(".rt-suggestion")).toHaveText(["Res ab"]);
    const calls = await page.evaluate(() =>
      window.calls.map(({ query, signal }) => ({ query, aborted: signal.aborted })),
    );
    expect(calls).toEqual([
      { query: "a", aborted: true },
      { query: "ab", aborted: false },
    ]);
  });

  test("a row picked while a newer search is pending replaces the whole query", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      mount({
        options: {
          suggestions: [
            {
              trigger: "@",
              kind: "mention",
              minChars: 1,
              search(query) {
                const rows = [{ id: query, name: `Res ${query}` }];
                return query === "a" ? rows : new Promise((resolve) => setTimeout(() => resolve(rows), 2000));
              },
            },
          ],
        },
      }),
    );
    await page.locator(".rt-editor").click();
    await page.keyboard.type("@a");
    await expect(page.locator(".rt-suggestion")).toHaveText(["Res a"]);
    await page.keyboard.type("b");
    await page.keyboard.press("Enter");
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveText("@Res a");
    await expect(page.locator(".rt-editor")).not.toContainText("b");
  });

  test("Escape dismisses until the query changes", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      mount({ options: { suggestions: [{ trigger: "@", search: (query) => [`${query}1`, `${query}2`] }] } }),
    );
    await page.locator(".rt-editor").click();
    await page.keyboard.type("@x");
    await expect(page.locator(".rt-suggestion")).toHaveCount(2);
    await page.keyboard.press("Escape");
    await expect(page.locator(".rt-suggestions")).toBeHidden();
    await page.waitForTimeout(100);
    await expect(page.locator(".rt-suggestions")).toBeHidden();
    await page.keyboard.type("y");
    await expect(page.locator(".rt-suggestion")).toHaveText(["xy1", "xy2"]);
    await expect(page.locator(".rt-editor")).toHaveAttribute("aria-expanded", "true");
  });

  test("composition suppresses suggestions until it ends", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      mount({
        options: { suggestions: [{ trigger: "@", minChars: 1, search: (query) => [`hit ${query}`] }] },
      }),
    );
    await page.locator(".rt-editor").click();
    await page.keyboard.type("@");
    await page.evaluate(() =>
      rt.surface.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true })),
    );
    // execCommand inserts text without IME events (Playwright's Firefox insertText composes).
    await page.evaluate(() => document.execCommand("insertText", false, "k"));
    await page.waitForTimeout(100);
    await expect(page.locator(".rt-suggestions")).toBeHidden();
    await page.evaluate(() =>
      rt.surface.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true })),
    );
    await expect(page.locator(".rt-suggestion")).toHaveText(["hit k"]);
  });

  test("rows are clickable inside a modal dialog", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      mount({
        options: {
          suggestions: [{ trigger: "@", kind: "mention", search: () => [{ id: "a", name: "Alice" }] }],
        },
      });
      const dialog = document.createElement("dialog");
      document.body.append(dialog);
      dialog.append(document.querySelector("#root"));
      dialog.showModal();
    });
    await page.locator(".rt-editor").click();
    await page.keyboard.type("@");
    await page.locator(".rt-suggestion").click();
    await expect(page.locator(".rt-editor [data-rt-mention]")).toHaveText("@Alice");
    await expect(page.locator(".rt-suggestion")).toHaveCount(0);
  });

  test("search errors close the popup and emit richtext:suggestionerror", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      mount({
        options: {
          suggestions: [
            {
              trigger: "@",
              search: async () => {
                throw new Error("offline");
              },
            },
          ],
        },
      }),
    );
    await page.locator(".rt-editor").click();
    await page.keyboard.type("@a");
    await expect.poll(() => page.evaluate(() => window.events)).toContain("richtext:suggestionerror");
    await expect(page.locator(".rt-suggestions")).toBeHidden();
  });
});

test.describe("toolbar", () => {
  test("renders groups and per-command label/content overrides", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      mount({
        options: {
          toolbar: "bold italic | undo",
          toolbarLabel: "Mise en forme",
          buttons: {
            bold: { label: "Gras", content: "G" },
            italic: {
              label: "Italique",
              content: () => Object.assign(document.createElement("i"), { className: "icon-italic" }),
            },
          },
        },
      }),
    );
    await expect(page.locator(".rt-toolbar")).toHaveAttribute("aria-label", "Mise en forme");
    await expect(page.locator(".rt-group")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "Gras" })).toHaveText("G");
    await expect(page.getByRole("button", { name: "Italique" }).locator("i.icon-italic")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Undo" })).toHaveText("↶");
  });

  test("clicking a button keeps focus and selection in the editor", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: "<p>Hello world</p>" }));
    await page.evaluate(() => {
      const text = rt.surface.querySelector("p").firstChild;
      const range = document.createRange();
      range.setStart(text, 6);
      range.setEnd(text, 11);
      rt.squire.focus();
      rt.squire.setSelection(range);
    });
    await page.getByRole("button", { name: "Bold" }).click();
    await expect(page.locator(".rt-editor")).toBeFocused();
    await expect(page.locator("#note")).toHaveValue("<p>Hello <b>world</b></p>");
    await expect(page.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  });

  test("arrow keys move a single tab stop across groups", async ({ page }) => {
    await open(page);
    await page.evaluate(() => mount({ html: "<p>x</p>" }));
    await page.getByRole("button", { name: "Bold" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: "Bulleted list" })).toBeFocused();
    const tabStops = await page.locator('.rt-toolbar button[tabindex="0"]').count();
    expect(tabStops).toBe(1);
  });
});

test.describe("lifecycle", () => {
  test("dispose() leaves no generated surface, popover or label id behind", async ({ page }) => {
    await open(page);
    await page.evaluate(() =>
      mount({ html: "<p>Hi</p>", options: { suggestions: [{ trigger: "@", search: () => ["one"] }] } }),
    );
    await page.locator(".rt-editor").click();
    await page.keyboard.type(" @");
    await expect(page.locator(".rt-suggestion")).toHaveCount(1);

    await page.evaluate(() => {
      rt.dispose();
      rt.dispose();
      document.querySelector("#form").reset();
      document.querySelector("#note").dispatchEvent(new Event("input"));
    });
    await page.waitForTimeout(50);
    await expect(page.locator(".rt-shell, .rt-suggestions")).toHaveCount(0);
    await expect(page.locator("#note")).toBeVisible();
    await expect(page.locator('label[for="note"]')).not.toHaveAttribute("id", /./);
  });

  test("an authored aria-labelledby wins over labels and is mirrored live", async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      mount({ attrs: { "aria-labelledby": "title hint" } });
    });
    const editor = page.locator(".rt-editor");
    await expect(editor).toHaveAttribute("aria-labelledby", "title hint");
    await expect(page.locator('label[for="note"]')).not.toHaveAttribute("id", /./);

    await page.evaluate(() => rt.source.removeAttribute("aria-labelledby"));
    await expect(editor).toHaveAttribute("aria-labelledby", /^rt-label-\d+$/);
  });

  test("<rich-text> rebinds when its textarea is replaced", async ({ page }) => {
    await open(page);
    await page.evaluate(async () => {
      defineRichText();
      document.querySelector("#root").innerHTML =
        '<rich-text id="host"><textarea name="a"><p>First</p></textarea></rich-text>';
      await document.querySelector("#host").whenReady();
    });
    await expect(page.locator("#host .rt-editor")).toHaveText("First");

    await page.evaluate(() => {
      const next = document.createElement("textarea");
      next.name = "b";
      next.value = "<p>Second</p>";
      document.querySelector("#host textarea").replaceWith(next);
    });
    await expect(page.locator("#host .rt-editor")).toHaveText("Second");
    await expect(page.locator("#host .rt-shell")).toHaveCount(1);
    await expect(page.locator("#host textarea")).toBeHidden();
    expect(await page.evaluate(() => document.querySelector("#host").richText.source.name)).toBe("b");

    await page.evaluate(() => document.querySelector("#host textarea").remove());
    await expect(page.locator("#host .rt-shell")).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector("#host").richText)).toBeNull();
  });
});
