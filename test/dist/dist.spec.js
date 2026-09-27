import { expect, test } from "@playwright/test";

test("classic dist self-registers and enhances the textarea", async ({ page }) => {
  await page.goto("/test/fixtures/dist.html");
  await expect(page.locator("#dist-note")).toBeHidden();
  await expect(page.locator("#dist-box .rt-editor")).toContainText("Dist works");
});
