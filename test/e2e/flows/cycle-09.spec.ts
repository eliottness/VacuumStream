import { expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

test.describe("cycle-09 showcase archive artwork states", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-09-1", async ({ controller, window }) => {
    const showcaseUrl = new URL(window.url())
    showcaseUrl.search = "?showcase=1"
    await window.goto(showcaseUrl.href)

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
        (document.querySelector<HTMLImageElement>('[data-focus-id="video-preview-recording"] img')
          ?.naturalWidth ?? 0) > 0 &&
        document.querySelector('[data-focus-id="video-preview-invalid-artwork"] img') === null &&
        document.querySelector(
          '[data-focus-id="video-preview-invalid-artwork"] .video-card__artwork-placeholder',
        ) !== null,
    )

    const artwork = await window.locator(".video-card").evaluateAll((cards) =>
      cards
        .filter((card) => card.getAttribute("data-focus-id")?.startsWith("video-preview-") === true)
        .map((card) => {
          const frame = card.querySelector<HTMLElement>(":scope > span:first-child")
          const image = frame?.querySelector<HTMLImageElement>("img")
          const bounds = frame?.getBoundingClientRect()
          return {
            hasBrokenImage: image?.naturalWidth === 0,
            hasPlaceholder: frame?.querySelector(".video-card__artwork-placeholder") !== null,
            height: bounds?.height ?? 0,
            imageSource: image?.getAttribute("src") ?? null,
            width: bounds?.width ?? 0,
          }
        }),
    )

    expect(artwork).toHaveLength(3)
    for (const { width, height } of artwork) {
      expect(width).toBeGreaterThan(0)
      expect(height).toBeGreaterThan(0)
      expect(width / height).toBeCloseTo(16 / 9, 2)
    }
    expect(artwork.map(({ hasBrokenImage }) => hasBrokenImage)).toEqual([false, false, false])
    expect(artwork.map(({ hasPlaceholder }) => hasPlaceholder)).toEqual([false, true, true])
    expect(artwork.map(({ imageSource }) => imageSource)).toEqual([expect.any(String), null, null])
    expect(await window.locator('img[src=""]').count()).toBe(0)
  })
})

test.describe("cycle-09 open a thumbnail-less followed archive", () => {
  test.use({ seed: {}, windowSize: { height: 1080, width: 1920 } })

  flowTest("F-cycle-09-2", async ({ controller, window }) => {
    await controller.waitForFocus("home-sign-in")
    await controller.press("Enter")
    await controller.waitForFocus("settings-sign-in")
    await controller.press("Enter")

    // Complete the device authorization in Twitch, then continue from the signed-in shell.
    await controller.waitForFocus("nav-following", 120_000)
    await controller.press("ArrowRight")
    await controller.waitForFocus("following-live")
    await controller.press("ArrowRight")
    await controller.waitForFocus("following-all")
    await controller.press("Enter")
    await controller.waitForFocus("following-directory-refresh")
    await controller.press("ArrowDown")
    expect(await controller.travelTo("following-directory-refresh", "ArrowUp", 80)).toBe(true)

    const offlineChannel = window.locator('[data-focus-id$="-videos"]').first()
    await offlineChannel.waitFor()
    await controller.travelTo(
      (await offlineChannel.getAttribute("data-focus-id")) ?? "",
      "ArrowDown",
      80,
    )
    await controller.press("Enter")
    await controller.waitForFocus("videos-back")
    await window.waitForSelector(".video-card")

    const thumbnailLess = window
      .locator(".video-card")
      .filter({ hasNot: window.locator("img") })
      .first()
    await thumbnailLess.waitFor()
    const thumbnailLessId = await thumbnailLess.getAttribute("data-focus-id")
    expect(thumbnailLessId).not.toBeNull()
    expect(await controller.travelTo(thumbnailLessId ?? "", "ArrowDown", 80)).toBe(true)
    await controller.press("Enter")

    await expect(window.locator("[role=alert]")).toHaveCount(0)
    await expect(window.locator("#twitch-player-root iframe")).toHaveCount(1)
  })
})
