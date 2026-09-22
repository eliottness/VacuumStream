import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-13 Loaded, absent and failed artwork geometry", () => {
  test.use({ seed: {}, windowSize: { height: 720, width: 1280 } })

  flowTest("F-cycle-13-1", async ({ app, controller, window }) => {
    // Test at 1280x720
    const showcaseUrl = new URL(window.url())
    showcaseUrl.search = "?showcase=1"
    await window.goto(showcaseUrl.href)
    await window.waitForSelector(".video-card", { timeout: 30_000 })

    await controller.press("ArrowDown")
    expect(await controller.travelTo("videos-back", "ArrowDown", 80)).toBe(true)
    await controller.press("ArrowDown")
    await controller.waitForFocus("video-preview-recording")
    await controller.press("ArrowRight")
    await controller.waitForFocus("video-preview-no-artwork")
    await controller.press("ArrowRight")
    await controller.waitForFocus("video-preview-invalid-artwork")
    await window.waitForFunction(
      () =>
        document.querySelector(
          '[data-focus-id="video-preview-invalid-artwork"] .video-card__artwork-placeholder',
        ) !== null,
    )
    await controller.press("ArrowUp")
    await controller.waitForFocus("videos-back")

    const artwork1280 = await window.locator(".video-card").evaluateAll((cards) =>
      cards
        .filter((card) => card.getAttribute("data-focus-id")?.startsWith("video-preview-") === true)
        .map((card) => {
          const frame = card.querySelector<HTMLElement>(":scope > span:first-child")
          const image = frame?.querySelector<HTMLImageElement>("img")
          const bounds = frame?.getBoundingClientRect()
          return {
            hasBrokenImage: image !== null && image !== undefined && image.naturalWidth === 0,
            hasPlaceholder: frame?.querySelector(".video-card__artwork-placeholder") !== null,
            height: Math.round(bounds?.height ?? 0),
            imageSource: image?.getAttribute("src") ?? null,
            width: Math.round(bounds?.width ?? 0),
          }
        }),
    )

    expect(artwork1280).toHaveLength(3)
    expect(artwork1280.map(({ width, height }) => `${width}x${height}`)).toEqual([
      "360x202",
      "360x202",
      "360x202",
    ])
    expect(artwork1280.map(({ hasBrokenImage }) => hasBrokenImage)).toEqual([false, false, false])
    expect(artwork1280.map(({ hasPlaceholder }) => hasPlaceholder)).toEqual([false, true, true])
    expect(artwork1280.map(({ imageSource }) => imageSource)).toEqual([
      expect.any(String),
      null,
      null,
    ])
    expect(await window.locator('img[src=""]').count()).toBe(0)

    // Test at 1920x1080
    await app.evaluate(
      async ({ BrowserWindow }, size) => {
        const [window] = BrowserWindow.getAllWindows()
        window?.setContentSize(size.width, size.height)
      },
      { width: 1920, height: 1080 },
    )

    const showcaseUrl2 = new URL(window.url())
    showcaseUrl2.search = "?showcase=1"
    await window.goto(showcaseUrl2.href)
    await window.waitForSelector(".video-card", { timeout: 30_000 })

    await controller.press("ArrowDown")
    expect(await controller.travelTo("videos-back", "ArrowDown", 80)).toBe(true)
    await controller.press("ArrowDown")
    await controller.waitForFocus("video-preview-recording")
    await controller.press("ArrowRight")
    await controller.waitForFocus("video-preview-no-artwork")
    await controller.press("ArrowRight")
    await controller.waitForFocus("video-preview-invalid-artwork")
    await window.waitForFunction(
      () =>
        document.querySelector(
          '[data-focus-id="video-preview-invalid-artwork"] .video-card__artwork-placeholder',
        ) !== null,
    )
    await controller.press("ArrowUp")
    await controller.waitForFocus("videos-back")

    const artwork1920 = await window.locator(".video-card").evaluateAll((cards) =>
      cards
        .filter((card) => card.getAttribute("data-focus-id")?.startsWith("video-preview-") === true)
        .map((card) => {
          const frame = card.querySelector<HTMLElement>(":scope > span:first-child")
          const image = frame?.querySelector<HTMLImageElement>("img")
          const bounds = frame?.getBoundingClientRect()
          return {
            hasBrokenImage: image !== null && image !== undefined && image.naturalWidth === 0,
            hasPlaceholder: frame?.querySelector(".video-card__artwork-placeholder") !== null,
            height: Math.round(bounds?.height ?? 0),
            imageSource: image?.getAttribute("src") ?? null,
            width: Math.round(bounds?.width ?? 0),
          }
        }),
    )

    expect(artwork1920).toHaveLength(3)
    expect(artwork1920.map(({ width, height }) => `${width}x${height}`)).toEqual([
      "545x306",
      "545x306",
      "545x306",
    ])
    expect(artwork1920.map(({ hasBrokenImage }) => hasBrokenImage)).toEqual([false, false, false])
    expect(artwork1920.map(({ hasPlaceholder }) => hasPlaceholder)).toEqual([false, true, true])
    expect(artwork1920.map(({ imageSource }) => imageSource)).toEqual([
      expect.any(String),
      null,
      null,
    ])
    expect(await window.locator('img[src=""]').count()).toBe(0)
    expect(await controller.focusId()).toBe("videos-back")
  })
})

test.describe("cycle-13 Guest Quick watch autoplay regression", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-13-2", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowRight")
    await controller.waitForFocus("home-connect-twitch")
    await controller.press("ArrowDown")
    await controller.waitForFocus("home-twitch")
    await controller.press("ArrowRight")
    await controller.waitForFocus("stream-preview-twitch")
    await controller.press("ArrowRight")
    expect(await controller.focusId()).toMatch(/^stream-/)
    await controller.press("Enter")

    await window.waitForSelector("#twitch-player-root iframe", { timeout: 10_000 })
    expect(await window.locator("#twitch-player-root iframe").count()).toBeGreaterThanOrEqual(1)

    await controller.press("Escape")
    await controller.waitForFocus("nav-home")
  })
})
