import { expect, test } from "../support/fixtures"
import { defectTest } from "../support/ledger-test"

test.describe("cycle-18 defects", () => {
  defectTest("D-cycle-18-1", async ({ app, controller, window }) => {
    await app.evaluate(({ ipcMain }) => {
      const state = {
        completed: 0,
        releases: [] as (() => void)[],
        requests: 0,
      }
      ;(
        globalThis as typeof globalThis & {
          __cycle18DeferredSearch?: typeof state
        }
      ).__cycle18DeferredSearch = state

      ipcMain.removeHandler("auth:snapshot")
      ipcMain.handle("auth:snapshot", () => ({
        displayName: "QA viewer",
        kind: "authenticated",
        login: "qa-viewer",
      }))
      ipcMain.removeHandler("catalog:search")
      ipcMain.handle(
        "catalog:search",
        () =>
          new Promise((resolve) => {
            state.requests += 1
            state.releases.push(() => {
              resolve({ items: [] })
              state.completed += 1
            })
          }),
      )
    })

    const submitAndObserve = async (target: "search-key-submit" | "search-submit") => {
      await controller.waitForFocus("nav-home")
      await controller.press("ArrowDown", 2)
      await controller.press("Enter")
      await controller.waitForFocus("search-input")
      await controller.press("ArrowDown")
      await controller.press("Enter")

      if (target === "search-key-submit") {
        await controller.press("ArrowDown", 4)
        await controller.press("ArrowRight", 3)
        await controller.waitForFocus(target)
      } else {
        await controller.press("ArrowUp")
        await controller.press("ArrowRight")
        await controller.waitForFocus(target)
      }

      await controller.press("Enter")
      await expect
        .poll(() =>
          app.evaluate(
            () =>
              (
                globalThis as typeof globalThis & {
                  __cycle18DeferredSearch?: { readonly requests: number }
                }
              ).__cycle18DeferredSearch?.requests ?? 0,
          ),
        )
        .toBe(target === "search-key-submit" ? 1 : 2)

      const button = window.locator(`[data-focus-id="${target}"]`)
      const observation = await button.evaluate((element) => {
        const button = element as HTMLButtonElement
        return {
          ariaDisabled: button.getAttribute("aria-disabled"),
          disabled: button.disabled,
          focus: document.activeElement?.getAttribute("data-focus-id") ?? "BODY",
        }
      })

      await app.evaluate(() => {
        const state = (
          globalThis as typeof globalThis & {
            __cycle18DeferredSearch?: { completed: number; releases: (() => void)[] }
          }
        ).__cycle18DeferredSearch
        state?.releases.shift()?.()
      })
      await expect
        .poll(() =>
          app.evaluate(
            () =>
              (
                globalThis as typeof globalThis & {
                  __cycle18DeferredSearch?: { readonly completed: number }
                }
              ).__cycle18DeferredSearch?.completed ?? 0,
          ),
        )
        .toBe(target === "search-key-submit" ? 1 : 2)
      return observation
    }

    await window.reload()
    const keyboardSubmit = await submitAndObserve("search-key-submit")
    await window.reload()
    const formSubmit = await submitAndObserve("search-submit")

    expect([keyboardSubmit, formSubmit]).toEqual([
      { ariaDisabled: "true", disabled: false, focus: "search-key-submit" },
      { ariaDisabled: "true", disabled: false, focus: "search-submit" },
    ])
  })
})
