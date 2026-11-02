import { expect, test } from "@playwright/test"
import { freshCanvas } from "./_helpers"

test.beforeEach(async ({ page }) => {
  await freshCanvas(page)
})

test("History and Library never overlap, and one click swaps between them", async ({ page }) => {
  await page.getByTestId("library-toggle").click()
  await expect(page.getByTestId("library-panel")).toBeVisible()
  // The History toggle moves into the open Library's header (no floating copy).
  await expect(page.getByTestId("history-toggle")).toHaveCount(1)

  await page.getByTestId("history-toggle").click()
  await expect(page.getByTestId("history-panel")).toBeVisible()
  await expect(page.getByTestId("library-panel")).toHaveCount(0)
  await expect(page.getByTestId("library-toggle")).toHaveCount(1)

  await page.getByTestId("library-toggle").click()
  await expect(page.getByTestId("library-panel")).toBeVisible()
  await expect(page.getByTestId("history-panel")).toHaveCount(0)

  // Collapsing the open panel brings back both floating toggles.
  await page.getByTestId("library-panel").getByTestId("library-toggle").click()
  await expect(page.getByTestId("library-toggle")).toBeVisible()
  await expect(page.getByTestId("history-toggle")).toBeVisible()
})

test("the Comments panel replaces the Layers panel on the left edge", async ({ page }) => {
  await page.getByTestId("layers-toggle").click()
  await expect(page.getByTestId("layers-panel")).toBeVisible()

  await page.getByRole("button", { name: "Menu" }).click()
  await page.getByTestId("menu-comments").click()
  await expect(page.getByTestId("comments-panel")).toBeVisible()
  await expect(page.getByTestId("layers-panel")).toHaveCount(0)
  await expect(page.getByTestId("layers-toggle")).toHaveCount(1)

  await page.getByTestId("comments-panel-close").click()
  await expect(page.getByTestId("layers-panel")).toBeVisible()
})

test("one click swaps between Layers and Comments", async ({ page }) => {
  await page.getByTestId("layers-toggle").click()
  await page.getByTestId("comments-toggle").click()
  await expect(page.getByTestId("comments-panel")).toBeVisible()
  await expect(page.getByTestId("layers-panel")).toHaveCount(0)

  await page.getByTestId("layers-toggle").click()
  await expect(page.getByTestId("layers-panel")).toBeVisible()
  await expect(page.getByTestId("comments-panel")).toHaveCount(0)
})
