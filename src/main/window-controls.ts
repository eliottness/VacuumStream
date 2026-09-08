import type { BrowserWindow } from "electron"

type FullscreenWindow = Pick<BrowserWindow, "setFullScreen">
type ScriptFrame = {
  readonly executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
  readonly url: string
}
type ScriptWebContents = {
  readonly mainFrame: { readonly frames: readonly ScriptFrame[] }
}

const ACTIVATE_PLAYER_MEDIA = `(async () => {
  const gate = document.querySelector('[data-a-target="content-classification-gate-overlay-start-watching-button"]');
  if (gate instanceof HTMLButtonElement) gate.click();
  await new Promise(requestAnimationFrame);
  const video = document.querySelector('video');
  if (!(video instanceof HTMLVideoElement)) return false;
  try {
    await video.play();
    return !video.paused;
  } catch {
    return false;
  }
})()`

export const activateEmbeddedPlayer = async (webContents: ScriptWebContents): Promise<boolean> => {
  const playerFrame = webContents.mainFrame.frames.find(
    (frame) => URL.canParse(frame.url) && new URL(frame.url).origin === "https://player.twitch.tv",
  )
  if (playerFrame === undefined) return false
  return Boolean(await playerFrame.executeJavaScript(ACTIVATE_PLAYER_MEDIA, true))
}

export const restoreShellFullscreen = (
  mainWindow: FullscreenWindow,
  runningInSteamGameMode: boolean,
): boolean => {
  mainWindow.setFullScreen(runningInSteamGameMode)
  return runningInSteamGameMode
}
