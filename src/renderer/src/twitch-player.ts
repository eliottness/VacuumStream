import type { PlayerSource } from "./components/PlayerView"

export type TwitchPlayerOptions = {
  readonly autoplay: boolean
  readonly channel?: string
  readonly height: "100%"
  readonly muted: boolean
  readonly parent: readonly ["localhost"]
  readonly time?: string
  readonly video?: string
  readonly width: "100%"
}

export interface TwitchPlayerInstance {
  readonly addEventListener: (event: string, listener: () => void) => void
  readonly getCurrentTime: () => number
  readonly getDuration: () => number
  readonly getMuted: () => boolean
  readonly getQualities: () => unknown
  readonly getQuality: () => string
  readonly isPaused: () => boolean
  readonly pause: () => void
  readonly play: () => void
  readonly seek: (seconds: number) => void
  readonly setMuted: (muted: boolean) => void
  readonly setQuality: (qualityId: string) => void
}

export type TwitchQuality = {
  readonly id: string
  readonly label: string
}

// The documented string list and the official-forum group/name shape share this boundary.
export const normalizeTwitchQualities = (value: unknown): readonly TwitchQuality[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry: unknown): TwitchQuality[] => {
    if (typeof entry === "string" && entry.trim() !== "") {
      return [{ id: entry, label: entry }]
    }
    if (
      typeof entry === "object" &&
      entry !== null &&
      "group" in entry &&
      typeof entry.group === "string" &&
      entry.group.trim() !== "" &&
      "name" in entry &&
      typeof entry.name === "string" &&
      entry.name.trim() !== ""
    ) {
      return [{ id: entry.group, label: entry.name }]
    }
    return []
  })
}

type TwitchPlayerConstructor = {
  new (elementId: string, options: TwitchPlayerOptions): TwitchPlayerInstance
  readonly OFFLINE: string
  readonly PAUSE: string
  readonly PLAY: string
  readonly PLAYBACK_BLOCKED: string
  readonly PLAYING: string
  readonly READY: string
  readonly SEEK: string
}

type TwitchPlayerApi = {
  readonly Player: TwitchPlayerConstructor
}

declare global {
  interface Window {
    Twitch?: TwitchPlayerApi
  }
}

// Documented event name (Twitch.Player.ENDED).
export const TWITCH_PLAYER_ENDED = "ended"

let playerApiPromise: Promise<TwitchPlayerApi> | undefined

export const createTwitchPlayerOptions = (
  source: PlayerSource,
  startingPosition?: number,
): TwitchPlayerOptions => {
  const base = {
    autoplay: true,
    height: "100%",
    muted: true,
    parent: ["localhost"],
    width: "100%",
  } as const
  if (source.kind === "live") return { ...base, channel: source.channel }
  const seconds = Math.floor(startingPosition ?? 0)
  return {
    ...base,
    ...(seconds > 0
      ? { time: `${Math.floor(seconds / 3600)}h${Math.floor(seconds / 60) % 60}m${seconds % 60}s` }
      : {}),
    video: source.videoId,
  }
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
