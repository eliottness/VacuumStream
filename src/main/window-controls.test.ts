import { describe, expect, it } from "vitest"
import { activateEmbeddedPlayer, restoreShellFullscreen } from "./window-controls"

describe("window controller actions", () => {
  it("activates the focused Twitch control through trusted browser input", async () => {
    // Given Twitch and unrelated child frames
    const executions: boolean[] = []
    const webContents = {
      mainFrame: {
        frames: [
          {
            executeJavaScript: async (): Promise<boolean> => false,
            url: "https://example.com/frame",
          },
          {
            executeJavaScript: async (_code: string, userGesture?: boolean): Promise<boolean> => {
              executions.push(userGesture === true)
              return true
            },
            url: "https://player.twitch.tv/embed",
          },
        ],
      },
    }

    // When controller playback activation is requested
    const gateDismissed = await activateEmbeddedPlayer(webContents)

    // Then only the Twitch frame receives user-gesture activation
    expect(gateDismissed).toBe(true)
    expect(executions).toEqual([true])
  })

  it("restores the desktop shell to windowed mode", () => {
    // Given a fullscreen-capable desktop window
    const fullscreenStates: boolean[] = []
    const mainWindow = {
      setFullScreen: (fullscreen: boolean): void => {
        fullscreenStates.push(fullscreen)
      },
    }

    // When player fullscreen is left outside Steam Gaming Mode
    const fullscreen = restoreShellFullscreen(mainWindow, false)

    // Then the shell is explicitly windowed instead of toggled
    expect(fullscreen).toBe(false)
    expect(fullscreenStates).toEqual([false])
  })

  it("preserves fullscreen when returning to Steam Gaming Mode shell", () => {
    // Given a fullscreen-capable Gaming Mode window
    const fullscreenStates: boolean[] = []
    const mainWindow = {
      setFullScreen: (fullscreen: boolean): void => {
        fullscreenStates.push(fullscreen)
      },
    }

    // When player fullscreen is left in Steam Gaming Mode
    const fullscreen = restoreShellFullscreen(mainWindow, true)

    // Then the shell returns to its intended fullscreen baseline
    expect(fullscreen).toBe(true)
    expect(fullscreenStates).toEqual([true])
  })
})
