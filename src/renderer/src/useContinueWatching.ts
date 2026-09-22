import { useCallback, useEffect, useRef, useState } from "react"
import type { PlaybackBookmark } from "../../shared/contracts"
import { listProgress, queueProgress } from "./playback-progress"

export type ContinueWatchingState = {
  readonly error: string
  readonly items: readonly PlaybackBookmark[]
  readonly removalError: { readonly message: string; readonly videoId: string } | undefined
  readonly removingId: string | undefined
  readonly status: "error" | "loading" | "ready"
}

const initialState: ContinueWatchingState = {
  error: "",
  items: [],
  removalError: undefined,
  removingId: undefined,
  status: "loading",
}

export const useContinueWatching = (active: boolean) => {
  const [state, setState] = useState(initialState)
  const generation = useRef(0)
  const pending = useRef<"list" | "remove" | undefined>(undefined)
  const invalidate = useCallback((): void => {
    generation.current += 1
    pending.current = undefined
  }, [])

  const load = useCallback(async (): Promise<void> => {
    if (!active || pending.current !== undefined) return
    const requestId = ++generation.current
    pending.current = "list"
    setState((current) => ({ ...current, error: "", removingId: undefined, status: "loading" }))
    try {
      const items = await listProgress()
      if (requestId !== generation.current) return
      setState({ ...initialState, items, status: "ready" })
    } catch (error) {
      if (requestId !== generation.current) return
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Could not read local playback progress.",
        status: "error",
      }))
    } finally {
      if (requestId === generation.current) pending.current = undefined
    }
  }, [active])

  useEffect(() => {
    if (active) void load()
    return invalidate
  }, [active, invalidate, load])

  const forget = async (videoId: string): Promise<void> => {
    if (!active || pending.current === "remove") return
    // Invalidate even an already-running listing before it can resurrect this entry.
    const requestId = ++generation.current
    pending.current = "remove"
    setState((current) => ({
      ...current,
      error: "",
      removalError: undefined,
      removingId: videoId,
      status: "ready",
    }))
    try {
      await queueProgress(videoId, () => window.vacuumStream.playbackProgress.remove(videoId))
      if (requestId !== generation.current) return
      setState((current) => ({
        ...current,
        items: current.items.filter((item) => item.videoId !== videoId),
        removingId: undefined,
      }))
    } catch (error) {
      if (requestId !== generation.current) {
        console.error("Could not forget local playback progress.", error)
        return
      }
      setState((current) => ({
        ...current,
        removalError: {
          message:
            error instanceof Error ? error.message : "Could not forget local playback progress.",
          videoId,
        },
        removingId: undefined,
      }))
    } finally {
      if (requestId === generation.current) pending.current = undefined
    }
  }

  return { ...state, forget, invalidate, items: state.items.slice(0, 10), retry: load }
}
