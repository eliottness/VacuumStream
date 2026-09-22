import {
  ArrowLeftIcon,
  CornersOutIcon,
  FilmStripIcon,
  PauseIcon,
  PlayIcon,
  SpeakerHighIcon,
  SpeakerSimpleXIcon,
} from "@phosphor-icons/react"
import { cloneElement, useCallback, useEffect, useRef, useState } from "react"
import { markControllerFocus, registerBackDismissal } from "../focus-navigation"
import {
  createTwitchPlayerOptions,
  loadTwitchPlayerApi,
  TWITCH_PLAYER_ENDED,
  type TwitchPlayerInstance,
} from "../twitch-player"
import { usePlayerCaptions } from "./usePlayerCaptions"
import { usePlayerChat } from "./usePlayerChat"
import { usePlayerQuality } from "./usePlayerQuality"
import { useVideoResume, type VideoProgress, type VideoSampleReason } from "./useVideoResume"

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

const SEEK_ACTIONS = [
  { id: "player-seek-back-5m", label: "Back 5 minutes", seconds: -300 },
  { id: "player-seek-back-30s", label: "Back 30 seconds", seconds: -30 },
  { id: "player-seek-forward-30s", label: "Forward 30 seconds", seconds: 30 },
  { id: "player-seek-forward-5m", label: "Forward 5 minutes", seconds: 300 },
] as const

const FIRST_SEEK_ACTION = SEEK_ACTIONS[0]
const LAST_SEEK_ACTION = SEEK_ACTIONS.at(-1) ?? FIRST_SEEK_ACTION

const formatTime = (seconds: number | undefined, showHours: boolean): string => {
  if (seconds === undefined) return "--:--"
  const wholeSeconds = Math.floor(Math.max(0, seconds))
  const minutes = Math.floor(wholeSeconds / 60)
  const remainder = String(wholeSeconds % 60).padStart(2, "0")
  return showHours
    ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${remainder}`
    : `${minutes}:${remainder}`
}

export const PlayerView = ({
  onBack,
  onPastBroadcasts,
  onToggleFullscreen,
  source,
}: PlayerViewProps) => {
  const [frameState, setFrameState] = useState<"loading" | "offline" | "ready" | "startup-error">(
    "loading",
  )
  const [startupAttempt, setStartupAttempt] = useState(0)
  const startupAttemptRef = useRef(0)
  const [muted, setMuted] = useState(true)
  const [paused, setPaused] = useState(true)
  const [position, setPosition] = useState<number | undefined>(undefined)
  const [duration, setDuration] = useState<number | undefined>(undefined)
  const [seekTransportOpen, setSeekTransportOpen] = useState(false)
  const autoStartGenerationRef = useRef(0)
  const autoStartTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const seekButtonRef = useRef<HTMLButtonElement>(null)
  const playerRef = useRef<TwitchPlayerInstance | undefined>(undefined)
  const progressRef = useRef<VideoProgress | undefined>(undefined)
  const { beginProgress, canPlay, progressStatus, resumePrompt, startingPosition } = useVideoResume(
    source,
    onBack,
  )
  const { chatButton, chatEnterButton, chatHint, chatPane, chatReloadButton, fullscreenLeft } =
    usePlayerChat(source, backButtonRef)
  const { dismissQualityChooser, qualityButton, qualityChooser, refreshQualities, resetQualities } =
    usePlayerQuality(playerRef, frameState === "ready")

  const { captionsButton, captionsChooser, dismissCaptionsChooser, resetCaptions } =
    usePlayerCaptions(playerRef, frameState === "ready")

  const dismissSeekTransport = useCallback((): boolean => {
    if (!seekTransportOpen) return false
    setSeekTransportOpen(false)
    const seekButton = seekButtonRef.current
    if (seekButton !== null) {
      markControllerFocus(seekButton)
      seekButton.focus()
    }
    return true
  }, [seekTransportOpen])

  // Back closes the submenu the viewer is in, or the first one still open, before leaving.
  const dismissSubmenu = useCallback((): boolean => {
    const focused = document.activeElement
    const submenus = [
      { dismiss: dismissQualityChooser, id: "player-quality-chooser" },
      { dismiss: dismissCaptionsChooser, id: "player-captions-chooser" },
      { dismiss: dismissSeekTransport, id: "player-seek-transport" },
    ]
    const focusedSubmenu = submenus.find(
      ({ id }) => focused instanceof Element && focused.closest(`#${id}`) !== null,
    )
    return focusedSubmenu === undefined
      ? submenus.some(({ dismiss }) => dismiss())
      : focusedSubmenu.dismiss()
  }, [dismissCaptionsChooser, dismissQualityChooser, dismissSeekTransport])

  useEffect(() => registerBackDismissal(dismissSubmenu), [dismissSubmenu])

  const cancelAutoStart = useCallback((): void => {
    autoStartGenerationRef.current += 1
    if (autoStartTimerRef.current !== undefined) {
      clearTimeout(autoStartTimerRef.current)
      autoStartTimerRef.current = undefined
    }
  }, [])

  useEffect(() => {
    if (canPlay) backButtonRef.current?.focus()
  }, [canPlay])
  useEffect(() => {
    if (frameState !== "ready") return undefined
    // Ads and Twitch's own controls change playback without always emitting PLAY or PAUSE, so the
    // toolbar would keep offering the action the viewer already has. Resync when they reach for it.
    const resync = (): void => {
      const player = playerRef.current
      if (player === undefined) return
      setPaused(player.isPaused())
      setMuted(player.getMuted())
    }
    document.addEventListener("keydown", resync)
    return () => document.removeEventListener("keydown", resync)
  }, [frameState])
  useEffect(() => {
    let active = true
    let initialized = false
    let offline = false
    let timelineTimer: ReturnType<typeof setInterval> | undefined
    setFrameState("loading")
    setPosition(undefined)
    setDuration(undefined)
    resetQualities()
    resetCaptions()
    setSeekTransportOpen(false)
    if (!canPlay) return
    const progress =
      source.kind === "video" ? beginProgress(source, startingPosition, () => active) : undefined
    progressRef.current = progress
    const autoStartGeneration = autoStartGenerationRef.current + 1
    autoStartGenerationRef.current = autoStartGeneration
    let autoStartDeadline = 0
    let autoStartStarted = false
    let player: TwitchPlayerInstance | undefined
    const refreshTimeline = (reason: VideoSampleReason = "sample"): void => {
      // User intent cancels autoplay, not sampling; the mounted player owns this lifecycle.
      if (!active || !initialized || offline || source.kind !== "video" || player === undefined)
        return
      const currentTime = player.getCurrentTime()
      const totalTime = player.getDuration()
      setPosition(Number.isFinite(currentTime) ? currentTime : undefined)
      setDuration(Number.isFinite(totalTime) && totalTime > 0 ? totalTime : undefined)
      progress?.observe(currentTime, totalTime, reason)
    }
    const attemptAutoStart = (): void => {
      void window.vacuumStream.system.activateEmbeddedPlayer(true).then((playbackStarted) => {
        if (
          !active ||
          autoStartGenerationRef.current !== autoStartGeneration ||
          player === undefined
        ) {
          return
        }
        if (playbackStarted) {
          player.setMuted(false)
          setMuted(false)
          setPaused(false)
          return
        }
        if (Date.now() >= autoStartDeadline) {
          setPaused(true)
          return
        }
        autoStartTimerRef.current = setTimeout(attemptAutoStart, 500)
      })
    }
    void loadTwitchPlayerApi()
      .then((api) => {
        if (!active || startupAttemptRef.current !== startupAttempt) return
        player = new api.Player(
          "twitch-player-root",
          createTwitchPlayerOptions(source, startingPosition),
        )
        playerRef.current = player
        player.addEventListener(api.Player.READY, () => {
          if (!active || player === undefined) return
          initialized = true
          // Initialization cannot override an observed live outage; only ONLINE can.
          if (source.kind === "live" && offline) return
          offline = false
          setFrameState("ready")
          refreshQualities(player)
          if (source.kind === "video") {
            refreshTimeline("ready")
            if (timelineTimer === undefined) {
              timelineTimer = setInterval(refreshTimeline, 1000)
            }
          }
          setMuted(player.getMuted())
          setPaused(player.isPaused())
          if (!autoStartStarted) {
            autoStartStarted = true
            autoStartDeadline = Date.now() + 20_000
            attemptAutoStart()
          }
        })
        player.addEventListener(api.Player.PLAYING, () => {
          if (!active || !initialized || offline || player === undefined) return
          refreshQualities(player)
          refreshTimeline("playing")
        })
        if (source.kind === "video") {
          player.addEventListener(api.Player.SEEK, () => refreshTimeline("seek"))
          player.addEventListener(TWITCH_PLAYER_ENDED, () => {
            if (active) progress?.end()
          })
        }
        player.addEventListener(api.Player.PLAY, () => {
          if (active) setPaused(false)
        })
        player.addEventListener(api.Player.PAUSE, () => {
          if (!active) return
          setPaused(true)
          refreshTimeline("pause")
        })
        player.addEventListener(api.Player.PLAYBACK_BLOCKED, () => {
          if (active) setPaused(true)
        })
        player.addEventListener(api.Player.ONLINE, () => {
          if (!active || source.kind !== "live" || player === undefined) return
          offline = false
          setFrameState(initialized ? "ready" : "loading")
          if (!initialized) return
          // Availability is not playback: refresh the shell without reactivating media.
          setMuted(player.getMuted())
          setPaused(player.isPaused())
          refreshQualities(player)
        })
        player.addEventListener(api.Player.OFFLINE, () => {
          if (!active) return
          offline = true
          clearInterval(timelineTimer)
          timelineTimer = undefined
          setFrameState("offline")
          resetQualities(false)
        })
      })
      .catch(() => {
        if (!active || startupAttemptRef.current !== startupAttempt) return
        setFrameState("startup-error")
      })
    return () => {
      progress?.leave()
      active = false
      resetCaptions()
      progressRef.current = undefined
      clearInterval(timelineTimer)
      cancelAutoStart()
      player?.pause()
      playerRef.current = undefined
      document.querySelector("#twitch-player-root")?.replaceChildren()
    }
  }, [
    source,
    startupAttempt,
    canPlay,
    startingPosition,
    beginProgress,
    cancelAutoStart,
    refreshQualities,
    resetCaptions,
    resetQualities,
  ])

  const retryStartup = (): void => {
    if (frameState !== "startup-error" || startupAttemptRef.current !== startupAttempt) return
    // Lock synchronously, before React commits the pending state.
    startupAttemptRef.current += 1
    if (backButtonRef.current !== null) {
      markControllerFocus(backButtonRef.current)
      backButtonRef.current.focus()
    }
    setFrameState("loading")
    setStartupAttempt(startupAttemptRef.current)
  }

  const togglePlayback = (): void => {
    cancelAutoStart()
    const player = playerRef.current
    if (player === undefined) return
    // Twitch pauses for ads without always emitting PAUSE, so the player's own state decides.
    if (player.isPaused()) {
      void window.vacuumStream.system.activateEmbeddedPlayer(false).then((playbackStarted) => {
        setMuted(player.getMuted())
        if (playbackStarted) setPaused(false)
      })
    } else {
      player.pause()
    }
  }

  const toggleMuted = (): void => {
    cancelAutoStart()
    const player = playerRef.current
    if (player === undefined) return
    const nextMuted = !player.getMuted()
    player.setMuted(nextMuted)
    setMuted(nextMuted)
  }

  const seekRelative = (seconds: number): void => {
    cancelAutoStart()
    const player = playerRef.current
    if (source.kind !== "video" || frameState !== "ready" || player === undefined) return
    const currentTime = player.getCurrentTime()
    const totalTime = player.getDuration()
    if (!Number.isFinite(currentTime) || !Number.isFinite(totalTime) || totalTime <= 0) return
    const destination = Math.min(totalTime, Math.max(0, currentTime + seconds))
    progressRef.current?.requestSeek(destination)
    player.seek(destination)
  }

  const showHours = duration !== undefined && duration >= 3600
  const unknownBroadcaster = source.kind === "video" && source.userId === "0"
  const seekTransportUsable =
    source.kind === "video" && frameState === "ready" && duration !== undefined
  const captionsRight = unknownBroadcaster
    ? seekTransportUsable
      ? "player-seek"
      : "player-fullscreen"
    : "player-vods"
  const vodsRight =
    source.kind === "live"
      ? "player-chat"
      : seekTransportUsable
        ? "player-seek"
        : "player-fullscreen"
  const seekLeft = unknownBroadcaster ? "player-captions" : "player-vods"
  const toolbarFullscreenLeft =
    source.kind === "video" ? (seekTransportUsable ? "player-seek" : seekLeft) : fullscreenLeft

  if (resumePrompt !== null) {
    return <main className="player-view player-view--resume">{resumePrompt}</main>
  }

  return (
    <main
      className={
        source.kind === "video" && seekTransportOpen
          ? "player-view player-view--video"
          : "player-view"
      }
    >
      <header className="player-toolbar">
        <button
          data-focus-down={
            source.kind === "video"
              ? seekTransportOpen
                ? "player-seek-back-5m"
                : "player-back"
              : undefined
          }
          data-focus-id="player-back"
          data-focus-left="player-fullscreen"
          data-focus-right={
            frameState === "startup-error"
              ? "player-retry"
              : frameState === "ready"
                ? "player-playback"
                : "player-quality"
          }
          data-focusable="true"
          onClick={onBack}
          ref={backButtonRef}
          type="button"
        >
          <ArrowLeftIcon aria-hidden="true" />
          Back
        </button>
        {frameState === "startup-error" ? (
          <button
            className="player-retry"
            data-focus-down="player-back"
            data-focus-id="player-retry"
            data-focus-left="player-back"
            data-focus-right="player-quality"
            data-focus-up="player-back"
            data-focusable="true"
            onClick={retryStartup}
            type="button"
          >
            Retry loading player
          </button>
        ) : null}
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
          type="button"
        >
          {paused ? <PlayIcon aria-hidden="true" /> : <PauseIcon aria-hidden="true" />}
        </button>
        <button
          aria-label={muted ? "Unmute" : "Mute"}
          data-focus-id="player-muted"
          data-focus-left="player-playback"
          data-focus-right="player-quality"
          data-focusable="true"
          disabled={frameState !== "ready"}
          onClick={toggleMuted}
          type="button"
        >
          {muted ? (
            <SpeakerSimpleXIcon aria-hidden="true" data-icon-state="muted" />
          ) : (
            <SpeakerHighIcon aria-hidden="true" data-icon-state="audible" />
          )}
        </button>
        {frameState === "startup-error"
          ? cloneElement(qualityButton, { "data-focus-left": "player-retry" })
          : qualityButton}
        {unknownBroadcaster
          ? cloneElement(captionsButton, { "data-focus-right": captionsRight })
          : captionsButton}
        <button
          data-focus-id="player-vods"
          data-focus-left="player-captions"
          data-focus-right={vodsRight}
          data-focusable="true"
          disabled={unknownBroadcaster}
          onClick={() => onPastBroadcasts(source.userId)}
          type="button"
        >
          <FilmStripIcon aria-hidden="true" />
          Past broadcasts
        </button>
        {source.kind === "video" ? (
          <button
            aria-controls={seekTransportOpen ? "player-seek-transport" : undefined}
            aria-expanded={seekTransportOpen}
            data-focus-down={seekTransportOpen ? "player-seek-back-5m" : "player-seek"}
            data-focus-id="player-seek"
            data-focus-left={seekLeft}
            data-focus-right="player-fullscreen"
            data-focus-up="player-back"
            data-focusable="true"
            disabled={!seekTransportUsable}
            onClick={() => setSeekTransportOpen((open) => !open)}
            ref={seekButtonRef}
            type="button"
          >
            Seek
          </button>
        ) : null}
        {chatButton}
        {chatEnterButton}
        {chatReloadButton}
        <button
          aria-label="Toggle fullscreen"
          data-focus-id="player-fullscreen"
          data-focus-left={toolbarFullscreenLeft}
          data-focus-right="player-back"
          data-focusable="true"
          onClick={onToggleFullscreen}
          type="button"
        >
          <CornersOutIcon aria-hidden="true" />
        </button>
      </header>
      {source.kind === "video" && seekTransportOpen ? (
        <section
          aria-label="Past broadcast seeking"
          className="player-transport"
          id="player-seek-transport"
        >
          {SEEK_ACTIONS.map((action, index) => (
            <button
              data-focus-down="player-back"
              data-focus-id={action.id}
              data-focus-left={SEEK_ACTIONS[index - 1]?.id ?? LAST_SEEK_ACTION.id}
              data-focus-right={SEEK_ACTIONS[index + 1]?.id ?? FIRST_SEEK_ACTION.id}
              data-focus-up="player-back"
              data-focusable="true"
              disabled={!seekTransportUsable}
              key={action.id}
              onClick={() => seekRelative(action.seconds)}
              type="button"
            >
              {action.label}
            </button>
          ))}
          <output aria-label="Playback position" aria-live="off" className="player-transport__time">
            {formatTime(position, showHours)} / {formatTime(duration, showHours)}
          </output>
        </section>
      ) : null}
      {progressStatus}
      {qualityChooser}
      {captionsChooser}
      {chatHint}
      {frameState === "startup-error" || frameState === "offline" ? (
        <p className="player-load-status" role="alert">
          {frameState === "startup-error"
            ? "Twitch player could not be loaded. Check your connection, then retry loading player."
            : "This Twitch source is offline. You can wait or go Back to choose another broadcast."}
        </p>
      ) : null}
      <div className="player-stage">
        <div aria-busy={frameState === "loading"} className="player-frame">
          <div className="twitch-player-root" id="twitch-player-root" />
        </div>
        {chatPane}
      </div>
    </main>
  )
}
