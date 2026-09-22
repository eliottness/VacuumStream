import { expect, test } from "../support/fixtures"

for (const windowSize of [
  { height: 1080, width: 1920 },
  { height: 720, width: 1280 },
]) {
  test.describe(`Home wrapped shelves at ${windowSize.width}x${windowSize.height}`, () => {
    test.use({ windowSize })

    test("wraps the trailing landing spot and navigates rows with arrows", async ({
      controller,
      window,
    }) => {
      // Pin the renderer viewport too: window-manager decorations can shrink native content.
      await window.setViewportSize(windowSize)
      await window.emulateMedia({ reducedMotion: "reduce" })
      await controller.waitForFocus("nav-home")
      await expect(window.locator(".stream-card")).toHaveCount(4)
      await expect(window.locator(".stream-card .live-badge")).toHaveCount(0)
      const layout = await window.locator(".shelf__reel--wrapped").evaluate((reel) => {
        const items = [...reel.children].map((item) => {
          const rect = item.getBoundingClientRect()
          return { left: rect.left, right: rect.right, top: rect.top }
        })
        return { items, width: globalThis.innerWidth }
      })
      expect(layout.items.at(-1)?.top).toBeGreaterThan(layout.items[0]?.top ?? 0)
      expect(layout.items.every((item) => item.left >= 0 && item.right <= layout.width)).toBe(true)
      await controller.press("ArrowRight")
      await controller.waitForFocus("home-sign-in")
      await controller.press("ArrowDown")
      await controller.waitForFocus("stream-preview-twitch")
      await controller.press("ArrowRight")
      await controller.waitForFocus("stream-preview-riotgames")
      await controller.press("ArrowDown")
      await controller.waitForFocus("home-end")
      await expect(window.locator('[data-focus-id="home-end"]')).toBeInViewport({ ratio: 1 })
      await controller.shot(`home-${windowSize.width}x${windowSize.height}`)
      await controller.press("ArrowUp")
      await controller.waitForFocus(
        windowSize.width === 1920 ? "stream-preview-twitch" : "stream-preview-riotgames",
      )
      await controller.press("ArrowUp")
      await controller.waitForFocus("home-sign-in")
      await controller.press("ArrowDown")
      await controller.press("ArrowDown")
      if (windowSize.width === 1280) {
        await controller.waitForFocus("stream-preview-lck")
        await controller.press("ArrowRight")
      }
      await controller.waitForFocus("home-end")
      await controller.press("ArrowDown")
      expect(await controller.focusId()).toMatch(/^category-/)
    })
  })
}
