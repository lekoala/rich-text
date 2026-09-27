import { expect, test } from "@playwright/test";

test("keeps the textarea as progressive baseline", async ({ page }) => {
  await page.goto("/test/fixtures/progressive.html");
  await expect(page.locator("textarea")).toBeVisible();
  await expect(page.locator(".rt-editor")).toHaveCount(0);

  await page.evaluate(() => window.defineRichTextForTest());
  await expect(page.locator("textarea")).toBeHidden();
  await expect(page.locator(".rt-editor")).toContainText("Hello");
});

test("syncs form value and form reset", async ({ page }) => {
  await page.goto("/test/fixtures/basic.html");
  const editor = page.locator("#basic .rt-editor");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" updated");
  await expect(page.locator("#note")).toHaveValue(/updated/);

  // A trusted click: the reset happens after the event's microtask checkpoint.
  await page.locator("#reset").click();
  await expect(page.locator("#note")).not.toHaveValue(/updated/);
  await expect(page.locator("#note")).toHaveValue(/Hello team/);
  await expect(editor).toContainText("Hello team");
  await expect(editor).not.toContainText("updated");
});

test("form reset honours a later preventDefault and a replacement made after it", async ({ page }) => {
  await page.goto("/test/fixtures/basic.html");
  const editor = page.locator("#basic .rt-editor");
  await editor.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" updated");
  await expect(page.locator("#note")).toHaveValue(/updated/);

  await page.evaluate(() => {
    const form = document.querySelector("#note").form;
    form.addEventListener("reset", (event) => event.preventDefault(), { once: true });
  });
  await page.locator("#reset").click();
  await expect(page.locator("#note")).toHaveValue(/updated/);
  await expect(editor).toContainText("updated");

  await page.evaluate(() => {
    const note = document.querySelector("#note");
    // The fixture's #reset button shadows form.reset.
    HTMLFormElement.prototype.reset.call(note.form);
    note.closest("rich-text").richText.setHTML("<p>Replaced</p>");
  });
  await page.waitForTimeout(50);
  await expect(editor).toHaveText("Replaced");
  await expect(page.locator("#note")).toHaveValue("<p>Replaced</p>");
});

test("sanitizes initial HTML", async ({ page }) => {
  await page.goto("/test/fixtures/basic.html");
  await expect(page.locator("#unsafe .rt-editor script")).toHaveCount(0);
  await expect(page.locator("#unsafe .rt-editor [onclick]")).toHaveCount(0);
  const value = await page.locator("#unsafe-note").inputValue();
  expect(value).not.toContain("script");
  expect(value).not.toContain("onclick");
});

test("inserts and atomically deletes a structured @mention", async ({ page }) => {
  await page.goto("/test/fixtures/basic.html");
  const editor = page.locator("#mentions .rt-editor");
  await editor.click();
  await page.keyboard.type("Hello @al");
  await expect(page.locator(".rt-suggestion")).toHaveCount(2);
  await page.keyboard.press("Enter");

  const mention = page.locator('#mentions [data-rt-mention="user"]');
  await expect(mention).toHaveText("@Alice Martin");
  await expect(page.locator("#mention-note")).toHaveValue(/data-id="u1"/);

  const mentions = await page.locator("#mentions").evaluate((element) => element.richText.getMentions());
  expect(mentions).toEqual([{ type: "user", id: "u1", label: "@Alice Martin" }]);

  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await expect(mention).toHaveCount(0);
});

test("slash suggestions can insert sanitized rich HTML", async ({ page }) => {
  await page.goto("/test/fixtures/basic.html");
  const editor = page.locator("#mentions .rt-editor");
  await editor.click();
  await page.keyboard.type("/fol");
  await expect(page.locator(".rt-suggestion")).toHaveText("Follow-up");
  await page.keyboard.press("Enter");
  await expect(editor).toContainText("Follow-up: check back next week.");
  await expect(page.locator("#mention-note")).toHaveValue(/<b>Follow-up:<\/b>/);
});
