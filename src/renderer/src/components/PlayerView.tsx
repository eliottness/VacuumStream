import {
  ArrowLeftIcon,
  CornersOutIcon,
  FilmStripIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSimpleXIcon,
} from "@phosphor-icons/react"
import { useEffect, useRef, useState } from "react"
import {
  createTwitchPlayerOptions,
  loadTwitchPlayerApi,
  type TwitchPlayerInstance,
} from "../twitch-player"

export type PlayerSource =
  | {
      readonly channel: string
      readonly kind: "live"
      readonly title: string
      readonly userId: string
    }
  | {
      readonly kind: "video"
      readonly title: string
      readonly userId: string
      readonly videoId: string
    }

type PlayerViewProps = {
  readonly onBack: () => void
  readonly onPastBroadcasts: (userId: string) => void
  readonly onToggleFullscreen: () => void
  readonly source: PlayerSource
}

export const PlayerView = ({
  onBack,
  onPastBroadcasts,
  onToggleFullscreen,
  source,
}: PlayerViewProps) => {
  const [frameState, setFrameState] = useState<"error" | "loading" | "ready">("loading")
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(true)
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const playbackButtonRef = useRef<HTMLButtonElement>(null)
  const playerRef = useRef<TwitchPlayerInstance | undefined>(undefined)

  useEffect(() => backButtonRef.current?.focus(), [])
  useEffect(() => {
    let active = true
    let player: TwitchPlayerInstance | undefined
    void loadTwitchPlayerApi()
      .then((api) => {
        if (!active) return
        player = new api.Player("twitch-player-root", createTwitchPlayerOptions(source))
        playerRef.current = player
        player.addEventListener(api.Player.READY, () => {
          if (!active || player === undefined) return
          setFrameState("ready")
          setMuted(player.getMuted())
          setPaused(player.isPaused())
        })
        player.addEventListener(api.Player.PLAY, () => {
          if (active) setPaused(false)
        })
        player.addEventListener(api.Player.PAUSE, () => {
          if (active) setPaused(true)
        })
        player.addEventListener(api.Player.PLAYBACK_BLOCKED, () => {
          if (active) setPaused(true)
        })
        player.addEventListener(api.Player.OFFLINE, () => {
          if (active) setFrameState("error")
        })
      })
      .catch(() => {
        if (active) setFrameState("error")
      })
    return () => {
      active = false
      player?.pause()
      playerRef.current = undefined
      document.querySelector("#twitch-player-root")?.replaceChildren()
    }
  }, [source])

  const togglePlayback = (): void => {
    const player = playerRef.current
    if (player === undefined) return
    if (paused) {
      const frame = document.querySelector<HTMLIFrameElement>("#twitch-player-root iframe")
      if (frame === null) return
      frame.focus()
      void window.vacuumStream.system.activateEmbeddedPlayer().then((playbackStarted) => {
        setMuted(player.getMuted())
        if (playbackStarted) setPaused(false)
        playbackButtonRef.current?.focus()
      })
    } else {
      player.pause()
    }
  }

  const toggleMuted = (): void => {
    const player = playerRef.current
    if (player === undefined) return
    const nextMuted = !player.getMuted()
    player.setMuted(nextMuted)
    setMuted(nextMuted)
  }

  return (
    <main className="player-view">
      <header className="player-toolbar">
        <button
          data-focus-id="player-back"
          data-focus-right="player-playback"
          data-focusable="true"
          onClick={onBack}
          ref={backButtonRef}
          type="button"
        >
          <ArrowLeftIcon aria-hidden="true" />
          Back
        </button>
        <div>
          <strong>{source.title}</strong>
          <span>{source.kind === "live" ? "Live on Twitch" : "Past broadcast"}</span>
        </div>
        <button
          aria-label={paused ? "Play" : "Pause"}
          data-focus-id="player-playback"
          data-focus-left="player-back"
          data-focus-right="player-muted"
          data-focusable="true"
          disabled={frameState !== "ready"}
          onClick={togglePlayback}
          ref={playbackButtonRef}
          type="button"
        >
          {paused ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
        </button>
        <button
          aria-label={muted ? "Unmute" : "Mute"}
          data-focus-id="player-muted"
          data-focus-left="player-playback"
          data-focus-right="player-vods"
          data-focusable="true"
          disabled={frameState !== "ready"}
          onClick={toggleMuted}
          type="button"
        >
          {muted ? (
            <SpeakerHighIcon aria-hidden="true" />
          ) : (
            <SpeakerSimpleXIcon aria-hidden="true" />
          )}
        </button>
        <button
          data-focus-id="player-vods"
          data-focus-left="player-muted"
          data-focus-right="player-fullscreen"
          data-focusable="true"
          onClick={() => onPastBroadcasts(source.userId)}
          type="button"
        >
          <FilmStripIcon aria-hidden="true" />
          Past broadcasts
        </button>
        <button
          aria-label="Toggle fullscreen"
          data-focus-id="player-fullscreen"
          data-focus-left="player-vods"
          data-focusable="true"
          onClick={onToggleFullscreen}
          type="button"
        >
          <CornersOutIcon aria-hidden="true" />
        </button>
      </header>
      <div className="player-frame">
        {frameState === "loading" ? (
          <div className="player-status">Loading Twitch player…</div>
        ) : null}
        {frameState === "error" ? (
          <div className="player-status" role="alert">
            Twitch player is offline or could not be loaded.
          </div>
        ) : null}
        <div className="twitch-player-root" id="twitch-player-root" />
      </div>
    </main>
  )
}
