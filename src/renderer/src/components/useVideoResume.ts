import { createElement, useCallback, useEffect, useState } from "react"
import type { PlaybackBookmark } from "../../../shared/contracts"
import { queueProgress } from "../playback-progress"
import type { PlayerSource } from "./PlayerView"
import { VideoResumePrompt } from "./VideoResumePrompt"

type VideoSource = Extract<PlayerSource, { kind: "video" }>
export type VideoSampleReason = "pause" | "playing" | "ready" | "sample" | "seek"
export type VideoProgress = {
  readonly end: () => void
  readonly leave: () => void
  readonly observe: (position: number, duration: number, reason: VideoSampleReason) => void
  readonly requestSeek: (position: number) => void
}

type Startup = {
  readonly bookmark?: PlaybackBookmark
  readonly error?: string
  readonly onResume?: () => void
  readonly onStartOver?: () => void
  readonly phase: "loading" | "choice" | "playing"
  readonly source: PlayerSource
  readonly startingPosition?: number | undefined
}

const initialStartup = (source: PlayerSource): Startup => ({
  phase: source.kind === "video" ? "loading" : "playing",
  source,
})

export const useVideoResume = (source: PlayerSource, onBack: () => void) => {
  const [startup, setStartup] = useState(() => initialStartup(source))
  const [status, setStatus] = useState<{ message: string; source: PlayerSource }>()
  // Discard the old decision before committing children, including a returning source object.
  if (startup.source !== source) {
    setStartup(initialStartup(source))
    setStatus(undefined)
  }
  const current = startup.source === source ? startup : initialStartup(source)
  const report = useCallback(
    (owner: PlayerSource, isActive: () => boolean, message: string): void => {
      if (isActive()) setStatus({ message, source: owner })
      else if (message !== "") console.error(message)
    },
    [],
  )

  useEffect(() => {
    if (source.kind !== "video") return
    let active = true
    let chosen = false
    const isActive = (): boolean => active
    const api = window.vacuumStream.playbackProgress
    setStartup(initialStartup(source))
    setStatus(undefined)
    const start = (startingPosition?: number, remove = false): void => {
      if (!active || chosen) return
      chosen = true
      if (remove) {
        void queueProgress(source.videoId, () => api.remove(source.videoId)).then(
          () => report(source, isActive, ""),
          () =>
            report(
              source,
              isActive,
              "Could not clear local playback progress. Playback can continue.",
            ),
        )
      }
      setStartup({ phase: "playing", source, startingPosition })
    }
    void queueProgress(source.videoId, () => api.get(source.videoId)).then(
      (bookmark) => {
        if (!active) return
        if (bookmark === undefined) start()
        else {
          setStartup({
            bookmark,
            onResume: () => start(bookmark.position),
            onStartOver: () => start(undefined, true),
            phase: "choice",
            source,
          })
        }
      },
      () => {
        if (!active) return
        setStartup({
          error: "Could not read local playback progress. You can still play without resuming.",
          onStartOver: () => start(),
          phase: "choice",
          source,
        })
      },
    )
    return () => {
      active = false
    }
  }, [source, report])

  const beginProgress = useCallback(
    (
      owner: VideoSource,
      startingPosition: number | undefined,
      isActive: () => boolean,
    ): VideoProgress => {
      const api = window.vacuumStream.playbackProgress
      const videoId = owner.videoId
      let ended = false
      let playing = false
      let confirmed = false
      let requestedSeek: number | undefined
      let observed: PlaybackBookmark | undefined
      let savedPosition = startingPosition
      let scheduledPosition = startingPosition
      let checkpointAt = Date.now()
      const checkpoint = (force: boolean): void => {
        if (ended || observed === undefined || observed.position === scheduledPosition) return
        const now = Date.now()
        if (!force && now - checkpointAt < 15_000) return
        checkpointAt = now
        const bookmark = { ...observed, updatedAt: now }
        scheduledPosition = bookmark.position
        void queueProgress(videoId, async () => {
          // ENDED cancels queued samples, then removes after any already-running write.
          if (ended) return false
          await api.save(bookmark)
          return true
        }).then(
          (saved) => {
            if (!saved) return
            savedPosition = bookmark.position
            if (isActive()) report(owner, isActive, "")
          },
          () => {
            if (scheduledPosition === bookmark.position) scheduledPosition = savedPosition
            report(
              owner,
              isActive,
              "Could not save local playback progress. Playback can continue.",
            )
          },
        )
      }
      return {
        end: () => {
          if (ended) return
          ended = true
          observed = undefined
          void queueProgress(videoId, () => api.remove(videoId)).then(
            () => report(owner, isActive, ""),
            () =>
              report(
                owner,
                isActive,
                "Could not clear completed playback progress. The old position may remain.",
              ),
          )
        },
        leave: () => checkpoint(true),
        observe: (position, duration, reason) => {
          if (ended || reason === "ready") return
          if (reason === "playing") playing = true
          if (
            !Number.isFinite(position) ||
            !Number.isFinite(duration) ||
            duration <= 0 ||
            position < 0 ||
            position > duration
          )
            return
          const sought =
            reason === "seek" &&
            requestedSeek !== undefined &&
            Math.abs(position - requestedSeek) < 1
          if (sought) requestedSeek = undefined
          // READY/loading zero is not progress. A resumed embed must first report its
          // requested position, unless the viewer explicitly seeks somewhere else.
          if (position === 0 && !sought) return
          if (
            sought ||
            ((playing || reason === "seek") && position >= Math.floor(startingPosition ?? 0))
          )
            confirmed = true
          if (!confirmed) return
          observed = {
            details: { title: owner.title, userId: owner.userId },
            duration,
            position,
            updatedAt: Date.now(),
            videoId,
          }
          checkpoint(reason === "pause" || reason === "seek")
        },
        requestSeek: (position) => {
          requestedSeek = position
        },
      }
    },
    [report],
  )

  return {
    beginProgress,
    canPlay: current.phase === "playing",
    progressStatus:
      status?.source === source && status.message !== ""
        ? createElement(
            "p",
            { className: "player-progress-status", role: "status" },
            status.message,
          )
        : null,
    resumePrompt:
      current.phase === "playing"
        ? null
        : createElement(VideoResumePrompt, {
            error: current.error,
            loading: current.phase === "loading",
            onBack,
            onResume: current.onResume,
            onStartOver: current.onStartOver,
            position: current.bookmark?.position,
            title: source.title,
          }),
    startingPosition: current.startingPosition,
  }
}
