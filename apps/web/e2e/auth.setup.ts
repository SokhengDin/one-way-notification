// Sign in through the real login page once and save the session cookie for
// the rest of the suite.
import { expect, test as setup } from "@playwright/test";
import { ADMIN } from "../playwright.config";

setup("sign in", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.context().storageState({ path: "e2e/.auth/admin.json" });
});
