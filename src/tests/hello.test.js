// @ts-check
const { test, expect } = require("@playwright/test");

test("has title", async ({ page }) => {
  await page.goto("https://playwright.dev/");

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Playwright/);
});

test("get started link", async ({ page }) => {
  await page.goto("https://playwright.dev/");

  // Click the get started link.
  await page.getByRole("link", { name: "Get started" }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(
    page.getByRole("heading", { name: "Installation" }),
  ).toBeVisible();

  await page.goto("https://bugbait.io/#/");
  await page.getByRole("button", { name: "Sign Up" }).click();
  await page.getByLabel("Username").click();
  await page.getByLabel("Email").click();
  await page.getByLabel("Email").fill("a");
  await page.getByLabel("Password", { exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("1");
  await page.getByLabel("Confirm Password", { exact: true }).click();
  await page.getByLabel("Confirm Password", { exact: true }).fill("1");
  await page.getByLabel("First Name").click();
  await page.getByLabel("First Name").fill("a");
  await page.getByLabel("Last Name").click();
  await page.getByLabel("Last Name").fill("a");
  await page.getByLabel("Username").click();
  await page.getByLabel("Username").fill("m");
  await page.getByRole("button", { name: "Sign Up" }).nth(1).click();
  await page.getByLabel("Email").click();
  await page.getByLabel("Password", { exact: true }).click();
  await page.getByLabel("Password", { exact: true }).fill("");
  await page.getByLabel("Confirm Password", { exact: true }).click();
  await page.getByLabel("Email").click();
  await page.getByLabel("Email").fill("a@");
  await page.getByLabel("Password", { exact: true }).click();
  await page.getByLabel("Email").click();
  await page.getByRole("button", { name: "Sign Up" }).nth(1).click();
  await page.getByRole("button", { name: "Sign Up" }).nth(1).click();
});
