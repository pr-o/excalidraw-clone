import { expect, test } from "@playwright/test"

test("rebind rectangle to q, use it, then reset", async ({ page }) => {
  await page.goto("/")
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  const rect = page.getByTestId("toolbar-rectangle")
  const selection = page.getByTestId("toolbar-selection")
  await rect.waitFor()

  await page.getByRole("button", { name: "Menu" }).click()
  await page.getByTestId("menu-tool-keys").click()
  await page.getByTestId("tool-key-rectangle").click()
  await page.keyboard.press("q")
  await expect(page.getByTestId("tool-key-rectangle")).toHaveText("Q")
  // Taken by the ellipse: rejected inline.
  await page.getByTestId("tool-key-selection").click()
  await page.keyboard.press("o")
  await expect(page.getByTestId("tool-key-row-selection").getByRole("alert")).toBeVisible()
  await page.keyboard.press("Escape")
  await page.getByRole("button", { name: "Close" }).last().click()

  await page.keyboard.press("q")
  await expect(rect).toHaveAttribute("aria-pressed", "true")
  await selection.click()
  await page.keyboard.press("r")
  await expect(rect).toHaveAttribute("aria-pressed", "false")

  // Survives a reload.
  await page.reload()
  await rect.waitFor()
  await page.keyboard.press("q")
  await expect(rect).toHaveAttribute("aria-pressed", "true")

  await page.getByRole("button", { name: "Menu" }).click()
  await page.getByTestId("menu-tool-keys").click()
  await page.getByTestId("tool-keys-reset-all").click()
  await expect(page.getByTestId("tool-key-rectangle")).toHaveText("R")
  await page.getByRole("button", { name: "Close" }).last().click()
  await selection.click()
  await page.keyboard.press("r")
  await expect(rect).toHaveAttribute("aria-pressed", "true")
})
