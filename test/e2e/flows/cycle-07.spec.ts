import { type Controller, expect, test } from "../support/fixtures"
import { flowTest } from "../support/ledger-test"

const openQuickWatch = async (controller: Controller): Promise<void> => {
  await controller.waitForFocus("nav-home")
  await controller.press("ArrowRight")
  await controller.press("ArrowDown")
  await controller.press("Enter")
  await controller.waitForFocus("player-back")
}

const focusChat = async (controller: Controller): Promise<void> => {
  const reached = await controller.travelTo("player-chat", "ArrowRight", 12)
  if (!reached) throw new Error("Could not reach the Show chat control")
  await controller.waitForFocus("player-chat")
}

test.describe("cycle-07 show chat", () => {
  test.use({ seed: {}, windowSize: { width: 1280, height: 720 } })

  flowTest("F-cycle-07-1", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await window.waitForSelector("#twitch-player-root iframe")
    await window.waitForSelector(".player-chat iframe")

    const observable = await window.evaluate(() => {
      const playerPane = document.querySelector(".player-stage > .player-frame")
      const chatPane = document.querySelector(".player-stage > .player-chat")
      const playerFrameCount = document.querySelectorAll("#twitch-player-root iframe").length
      const chatFrameCount = document.querySelectorAll(".player-chat iframe").length
      return {
        activeId: document.activeElement?.getAttribute("data-focus-id"),
        chatIsSibling:
          playerPane !== null &&
          chatPane !== null &&
          playerPane.parentElement === chatPane.parentElement &&
          playerPane.nextElementSibling === chatPane,
        chatFrameCount,
        playerFrameCount,
      }
    })

    expect(observable).toEqual({
      activeId: "player-chat",
      chatFrameCount: 1,
      chatIsSibling: true,
      playerFrameCount: 1,
    })
    await expect(window.locator('[data-focus-id="player-chat"]')).toHaveText("Hide chat")
  })
})

test.describe("cycle-07 reload chat", () => {
  test.use({ seed: {}, windowSize: { width: 1280, height: 720 } })

  flowTest("F-cycle-07-2", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await window.waitForSelector("#twitch-player-root iframe")
    await window.waitForSelector(".player-chat iframe")

    await window.evaluate(() => {
      const playerRoot = document.querySelector("#twitch-player-root")
      const playerFrame = document.querySelector("#twitch-player-root iframe")
      const chatFrame = document.querySelector(".player-chat iframe")
      if (playerRoot === null || playerFrame === null || chatFrame === null) {
        throw new Error("Missing player or chat frame before reload")
      }
      playerRoot.setAttribute("data-cycle07-player-root-before", "true")
      playerFrame.setAttribute("data-cycle07-player-frame-before", "true")
      chatFrame.setAttribute("data-cycle07-chat-frame-before", "true")
    })

    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("player-chat-reload")
    await controller.press("Enter")
    await window.waitForFunction(() => {
      const chatFrame = document.querySelector(".player-chat iframe")
      return chatFrame !== null && !chatFrame.hasAttribute("data-cycle07-chat-frame-before")
    })
    await controller.waitForFocus("player-chat-reload")

    const identities = await window.evaluate(() => ({
      chatFrameChanged: !document
        .querySelector(".player-chat iframe")
        ?.hasAttribute("data-cycle07-chat-frame-before"),
      chatFrameCount: document.querySelectorAll(".player-chat iframe").length,
      playerFrameUnchanged: document
        .querySelector("#twitch-player-root iframe")
        ?.hasAttribute("data-cycle07-player-frame-before"),
      playerRootUnchanged: document
        .querySelector("#twitch-player-root")
        ?.hasAttribute("data-cycle07-player-root-before"),
    }))

    expect(identities).toEqual({
      chatFrameChanged: true,
      chatFrameCount: 1,
      playerFrameUnchanged: true,
      playerRootUnchanged: true,
    })
  })
})

test.describe("cycle-07 chat reset", () => {
  test.use({ seed: {}, windowSize: { width: 1280, height: 720 } })

  flowTest("F-cycle-07-3", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await controller.press("Enter")
    await controller.press("Enter")
    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("player-chat-reload")
    await controller.press("Escape")
    await controller.waitForFocus("nav-home")

    await controller.press("ArrowRight")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await window.waitForFunction(() => {
      const chatButton = document.querySelector('[data-focus-id="player-chat"]')
      return (
        document.querySelector(".player-view") !== null &&
        document.querySelector(".player-chat iframe") === null &&
        chatButton?.getAttribute("aria-expanded") === "false"
      )
    })

    expect(await window.locator(".player-chat iframe").count()).toBe(0)
    await expect(window.locator('[data-focus-id="player-chat"]')).toHaveText("Show chat")
    await expect(window.locator('[data-focus-id="player-chat"]')).toHaveAttribute(
      "aria-expanded",
      "false",
    )
  })
})

test.describe("cycle-07 chat consent", () => {
  test.use({ seed: {}, windowSize: { width: 1280, height: 720 } })

  flowTest("F-cycle-07-4", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await window.waitForSelector(".player-chat iframe")
    await controller.press("ArrowDown")
    await controller.waitForFocus("player-chat-enter")
    await controller.press("Enter")
    await window.waitForFunction(() => document.activeElement?.tagName === "IFRAME")

    for (const key of ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"]) {
      await controller.press(key)
    }
    await controller.press("Enter")
    await controller.press("Escape")
    await controller.waitForFocus("player-chat")

    expect(await window.locator(".player-chat iframe").count()).toBe(1)
    await expect(window.locator('[data-focus-id="player-chat"]')).toHaveAttribute(
      "aria-expanded",
      "true",
    )
    expect(await window.evaluate(() => document.activeElement?.getAttribute("data-focus-id"))).toBe(
      "player-chat",
    )
  })
})

test.describe("cycle-07 narrow chat layout", () => {
  test.use({ seed: {}, windowSize: { width: 960, height: 720 } })

  flowTest("F-cycle-07-6", async ({ controller, window }) => {
    await openQuickWatch(controller)
    await focusChat(controller)
    await controller.press("Enter")
    await window.waitForSelector("#twitch-player-root iframe")
    await window.waitForSelector(".player-chat iframe")
    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("player-chat-reload")

    const layout = await window.evaluate(() => {
      const player = document.querySelector(".player-frame")?.getBoundingClientRect()
      const chat = document.querySelector(".player-chat")?.getBoundingClientRect()
      const fullyVisible = (rect: DOMRect | undefined): boolean =>
        rect !== undefined &&
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.right <= globalThis.innerWidth &&
        rect.bottom <= globalThis.innerHeight
      return {
        activeId: document.activeElement?.getAttribute("data-focus-id"),
        chatFullyVisible: fullyVisible(chat),
        chatHeight: chat?.height ?? 0,
        playerFullyVisible: fullyVisible(player),
        playerHeight: player?.height ?? 0,
        playerWidth: player?.width ?? 0,
      }
    })

    await controller.press("ArrowUp")
    await controller.waitForFocus("player-chat")
    await controller.press("Enter")
    await window.waitForFunction(() => document.querySelector(".player-chat iframe") === null)

    expect(layout).toMatchObject({
      activeId: "player-chat-reload",
      chatFullyVisible: true,
      playerFullyVisible: true,
    })
    expect(layout.chatHeight).toBeGreaterThanOrEqual(450)
    expect(layout.playerWidth).toBeGreaterThanOrEqual(400)
    expect(layout.playerHeight).toBeGreaterThanOrEqual(300)
  })
})

test.describe("cycle-07 hardware chat layout", () => {
  test.use({ seed: {}, windowSize: { width: 1280, height: 720 } })

  flowTest("F-cycle-07-5", async ({ controller, window }) => {
    await controller.waitForFocus("nav-home")
    await controller.press("ArrowDown", 2)
    await controller.press("Enter")
    await controller.waitForFocus("search-input")

    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.press("ArrowRight", 4)
    await controller.press("Enter")
    await controller.press("ArrowLeft", 3)
    await controller.press("Enter")
    await controller.press("ArrowRight", 6)
    await controller.press("Enter")
    await controller.press("ArrowLeft", 3)
    await controller.press("Enter")
    await controller.press("ArrowDown", 2)
    await controller.press("ArrowLeft", 2)
    await controller.press("Enter")
    await controller.press("ArrowRight", 3)
    await controller.press("ArrowUp")
    await controller.press("Enter")
    await controller.press("ArrowDown", 3)
    await controller.press("ArrowRight", 2)
    await controller.press("Enter")
    await window.waitForSelector(".channel-result")
    await controller.press("ArrowDown")
    await controller.press("Enter")
    await controller.waitForFocus("player-back")
    await focusChat(controller)
    await controller.press("Enter")
    await window.waitForSelector("#twitch-player-root iframe")
    await window.waitForSelector(".player-chat iframe")

    const beforeReload = await window.evaluate(() => {
      const player = document.querySelector(".player-frame")?.getBoundingClientRect()
      const chat = document.querySelector(".player-chat")?.getBoundingClientRect()
      return {
        chatFrameCount: document.querySelectorAll(".player-chat iframe").length,
        chatVisible: chat !== undefined && chat.width > 0 && chat.height > 0,
        playerHeight: player?.height ?? 0,
        playerWidth: player?.width ?? 0,
      }
    })
    expect(beforeReload).toMatchObject({ chatFrameCount: 1, chatVisible: true })
    expect(beforeReload.playerHeight).toBeGreaterThanOrEqual(300)
    expect(beforeReload.playerWidth).toBeGreaterThanOrEqual(400)

    await window.evaluate(() => {
      const playerRoot = document.querySelector("#twitch-player-root")
      const playerFrame = document.querySelector("#twitch-player-root iframe")
      if (playerRoot === null || playerFrame === null) throw new Error("Missing player frame")
      playerRoot.setAttribute("data-cycle07-hardware-root", "true")
      playerFrame.setAttribute("data-cycle07-hardware-frame", "true")
    })
    await controller.press("ArrowDown", 2)
    await controller.waitForFocus("player-chat-reload")
    await controller.press("Enter")
    await window.waitForFunction(() => {
      const chatFrame = document.querySelector(".player-chat iframe")
      return chatFrame !== null && !chatFrame.hasAttribute("data-cycle07-hardware-frame")
    })
    await controller.press("ArrowUp")
    await controller.waitForFocus("player-chat")
    await controller.press("Enter")
    await window.waitForFunction(() => document.querySelector(".player-chat iframe") === null)

    const observable = await window.evaluate(() => {
      const player = document.querySelector(".player-frame")?.getBoundingClientRect()
      return {
        chatFrameCount: document.querySelectorAll(".player-chat iframe").length,
        playerFrameUnchanged: document
          .querySelector("#twitch-player-root iframe")
          ?.hasAttribute("data-cycle07-hardware-frame"),
        playerHeight: player?.height ?? 0,
        playerRootUnchanged: document
          .querySelector("#twitch-player-root")
          ?.hasAttribute("data-cycle07-hardware-root"),
        playerWidth: player?.width ?? 0,
      }
    })

    expect(observable).toEqual({
      chatFrameCount: 0,
      playerFrameUnchanged: true,
      playerHeight: expect.any(Number),
      playerRootUnchanged: true,
      playerWidth: expect.any(Number),
    })
    expect(observable.playerHeight).toBeGreaterThanOrEqual(300)
    expect(observable.playerWidth).toBeGreaterThanOrEqual(400)
  })
})
