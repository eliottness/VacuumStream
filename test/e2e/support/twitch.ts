import type { Page } from "@playwright/test"

// On a fresh profile Twitch sometimes puts a mature-content interstitial in front of a recording,
// and its own player never reports READY until that button is activated. It lives inside Twitch's
// cross-origin iframe, so the shell cannot reach it and neither can controller keys.
export const dismissMatureContentGate = async (window: Page): Promise<void> => {
  const frame = window.frames().find((candidate) => candidate.url().includes("player.twitch.tv"))
  if (frame === undefined) return
  const startWatching = frame.getByRole("button", { name: "Start Watching" })
  if ((await startWatching.count()) === 0) return
  await startWatching
    .first()
    .click({ timeout: 2_000 })
    .catch(() => {})
}

// Dismissing that interstitial, and the shell's own autoplay nudge, leave DOM focus inside the
// cross-origin player where controller keys never reach the shell again, so hand focus back.
export const restoreShellFocus = async (window: Page): Promise<void> => {
  const insidePlayer = await window.evaluate(
    () => document.activeElement?.tagName === "IFRAME" || document.activeElement === document.body,
  )
  if (!insidePlayer) return
  await window.locator('[data-focus-id="player-back"]').focus()
}

export const waitForPlayerReady = async (window: Page, timeoutMs = 120_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs
  const isReady = (): Promise<boolean> =>
    window.evaluate(
      () =>
        document.querySelector<HTMLButtonElement>('[data-focus-id="player-playback"]')?.disabled ===
        false,
    )
  while (!(await isReady())) {
    if (Date.now() >= deadline) {
      throw new Error("The player never reached its ready state")
    }
    await dismissMatureContentGate(window)
  }
  await restoreShellFocus(window)
}
