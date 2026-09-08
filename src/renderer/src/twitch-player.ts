import type { PlayerSource } from "./components/PlayerView"

export type TwitchPlayerOptions = {
  readonly autoplay: boolean
  readonly channel?: string
  readonly height: "100%"
  readonly muted: boolean
  readonly parent: readonly ["localhost"]
  readonly video?: string
  readonly width: "100%"
}

export interface TwitchPlayerInstance {
  readonly addEventListener: (event: string, listener: () => void) => void
  readonly getMuted: () => boolean
  readonly isPaused: () => boolean
  readonly pause: () => void
  readonly play: () => void
  readonly setMuted: (muted: boolean) => void
}

type TwitchPlayerConstructor = {
  new (elementId: string, options: TwitchPlayerOptions): TwitchPlayerInstance
  readonly OFFLINE: string
  readonly PAUSE: string
  readonly PLAY: string
  readonly PLAYBACK_BLOCKED: string
  readonly READY: string
}

type TwitchPlayerApi = {
  readonly Player: TwitchPlayerConstructor
}

declare global {
  interface Window {
    Twitch?: TwitchPlayerApi
  }
}

let playerApiPromise: Promise<TwitchPlayerApi> | undefined

export const createTwitchPlayerOptions = (source: PlayerSource): TwitchPlayerOptions => {
  const base = {
    autoplay: false,
    height: "100%",
    muted: true,
    parent: ["localhost"],
    width: "100%",
  } as const
  return source.kind === "live"
    ? { ...base, channel: source.channel }
    : { ...base, video: source.videoId }
}

export const loadTwitchPlayerApi = (): Promise<TwitchPlayerApi> => {
  if (window.Twitch !== undefined) return Promise.resolve(window.Twitch)
  if (playerApiPromise !== undefined) return playerApiPromise

  playerApiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script")
    script.async = true
    script.src = "https://player.twitch.tv/js/embed/v1.js"
    script.addEventListener("load", () => {
      if (window.Twitch === undefined) {
        reject(new TypeError("Twitch Player API did not initialize"))
        return
      }
      resolve(window.Twitch)
    })
    script.addEventListener("error", () =>
      reject(new TypeError("Twitch Player API failed to load")),
    )
    document.head.append(script)
  })

  return playerApiPromise
}
