import type { BrowserWindow } from "electron"
import { z } from "zod"

type FullscreenWindow = Pick<BrowserWindow, "setFullScreen">
type ScriptFrame = {
  readonly executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>
  readonly url: string
}
type ScriptWebContents = {
  readonly mainFrame: { readonly frames: readonly ScriptFrame[] }
}

const MediaSampleSchema = z.object({
  beforeTime: z.number(),
  currentTime: z.number(),
  muted: z.boolean(),
  paused: z.boolean(),
  readyState: z.number().int().min(0).max(4),
  volume: z.number().min(0).max(1),
})

export const activateEmbeddedPlayer = async (
  webContents: ScriptWebContents,
  audible: boolean,
): Promise<boolean> => {
  const playerFrame = webContents.mainFrame.frames.find(
    (frame) => URL.canParse(frame.url) && new URL(frame.url).origin === "https://player.twitch.tv",
  )
  if (playerFrame === undefined) return false
  const script = `(async () => {
    const gate = document.querySelector('[data-a-target="content-classification-gate-overlay-start-watching-button"]');
    if (gate instanceof HTMLButtonElement) gate.click();
    await Promise.race([
      new Promise((resolve) => requestAnimationFrame(resolve)),
      new Promise((resolve) => setTimeout(resolve, 100)),
    ]);
    const video = document.querySelector('video');
    if (!(video instanceof HTMLVideoElement)) return null;
    const playButton = document.querySelector('[data-a-target="player-play-pause-button"]');
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA && playButton instanceof HTMLButtonElement) {
      playButton.click();
    }
    if (${audible}) {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        video.muted = true;
      } else {
        video.muted = false;
        if (video.volume === 0) video.volume = 0.5;
      }
    }
    const beforeTime = video.currentTime;
    void video.play().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 600));
    return {
      beforeTime,
      currentTime: video.currentTime,
      muted: video.muted,
      paused: video.paused,
      readyState: video.readyState,
      volume: video.volume,
    };
  })()`
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<{ readonly kind: "timeout" }>((resolve) => {
    timeoutId = setTimeout(() => resolve({ kind: "timeout" }), 1_500)
  })
  const execution = playerFrame.executeJavaScript(script, true).then(
    (value) => ({ kind: "value", value }) as const,
    () => ({ kind: "error" }) as const,
  )
  const result = await Promise.race([execution, timeout])
  if (timeoutId !== undefined) clearTimeout(timeoutId)
  if (result.kind !== "value") return false
  const parsed = MediaSampleSchema.safeParse(result.value)
  if (!parsed.success) return false
  const sample = parsed.data
  const playing =
    sample.readyState >= 2 && !sample.paused && sample.currentTime - sample.beforeTime >= 0.1
  return playing && (!audible || (!sample.muted && sample.volume > 0))
}

export const restoreShellFullscreen = (
  mainWindow: FullscreenWindow,
  runningInSteamGameMode: boolean,
): boolean => {
  mainWindow.setFullScreen(runningInSteamGameMode)
  return runningInSteamGameMode
}
