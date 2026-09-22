import { useCallback, useLayoutEffect, useRef } from "react"
import type { PlaybackBookmark } from "../../../shared/contracts"
import { markControllerFocus } from "../focus-navigation"
import type { ContinueWatchingState } from "../useContinueWatching"

export const recordingTitle = (bookmark: PlaybackBookmark): string =>
  bookmark.details?.title ?? `Recording ${bookmark.videoId}`

export const continueWatchingEntryId = (
  state: Pick<ContinueWatchingState, "items" | "status">,
  prefix = "continue",
): string | undefined =>
  state.items[0] === undefined
    ? state.status === "error"
      ? `${prefix}-retry`
      : undefined
    : `${prefix}-${state.items[0].videoId}-open`

type ContinueWatchingShelfProps = ContinueWatchingState & {
  readonly fallbackFocusId: string
  readonly focusPrefix?: string
  readonly lowerFocusId: string
  readonly onForget: (videoId: string) => void
  readonly onRetry: () => void
  readonly onSelect: (bookmark: PlaybackBookmark) => void
}

const formatTime = (value: number): string => {
  const seconds = Math.floor(value)
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

const focusTarget = (id: string): HTMLElement | undefined =>
  [...document.querySelectorAll<HTMLElement>("[data-focus-id]")].find(
    (element) => element.getAttribute("data-focus-id") === id,
  )

const focus = (id: string): void => {
  const target = focusTarget(id)
  if (target === undefined) return
  markControllerFocus(target)
  target.focus()
}

export const ContinueWatchingShelf = ({
  error,
  fallbackFocusId,
  focusPrefix = "continue",
  items,
  lowerFocusId,
  onForget,
  onRetry,
  onSelect,
  removalError,
  removingId,
  status,
}: ContinueWatchingShelfProps) => {
  const openId = (videoId: string): string => `${focusPrefix}-${videoId}-open`
  const forgetId = (videoId: string): string => `${focusPrefix}-${videoId}-forget`
  const retryId = `${focusPrefix}-retry`
  const focusedCardRef = useRef<{ element: HTMLButtonElement; index: number } | undefined>(
    undefined,
  )
  const actionRef = useRef<HTMLButtonElement | null>(null)
  const keepActionFocus = useCallback(
    (button: HTMLButtonElement | null): void => {
      if (button === null && document.activeElement === actionRef.current) focus(fallbackFocusId)
      actionRef.current = button
    },
    [fallbackFocusId],
  )

  useLayoutEffect(() => {
    const previous = focusedCardRef.current
    if (previous === undefined || previous.element.isConnected) return
    focusedCardRef.current = undefined
    if (document.activeElement !== null && document.activeElement !== document.body) return
    const next = items[Math.min(previous.index, items.length - 1)]
    focus(next === undefined ? fallbackFocusId : openId(next.videoId))
  })

  // Compose the upward edge with the existing live shelf without changing its internal graph.
  // Restore its own edge when this local shelf disappears or the lower control changes.
  const last = items.at(-1)
  const returnId =
    status === "error" ? retryId : last === undefined ? undefined : forgetId(last.videoId)
  useLayoutEffect(() => {
    if (returnId === undefined) return
    const lower = focusTarget(lowerFocusId)
    if (lower === undefined) return
    const previous = lower.getAttribute("data-focus-up")
    lower.setAttribute("data-focus-up", returnId)
    return () => {
      if (previous === null) lower.removeAttribute("data-focus-up")
      else lower.setAttribute("data-focus-up", previous)
    }
  })

  const feedback = (
    <>
      {status === "loading" ? <p role="status">Loading local playback progress...</p> : null}
      {status === "error" ? (
        <div className="continue-watching__error">
          <p className="error-message" role="alert">
            {error}
          </p>
          <button
            data-focus-down={lowerFocusId}
            data-focus-id={retryId}
            data-focus-left="nav-home"
            data-focus-right={items[0] === undefined ? lowerFocusId : openId(items[0].videoId)}
            data-focus-up={last === undefined ? "nav-home" : forgetId(last.videoId)}
            data-focusable="true"
            onClick={onRetry}
            ref={keepActionFocus}
            type="button"
          >
            Retry Continue Watching
          </button>
        </div>
      ) : null}
    </>
  )

  if (items.length === 0) {
    return status === "ready" ? null : <div className="continue-watching-status">{feedback}</div>
  }

  return (
    <section
      aria-busy={status === "loading"}
      aria-labelledby={`${focusPrefix}-heading`}
      className="shelf continue-watching"
    >
      <div className="shelf__heading">
        <h2 id={`${focusPrefix}-heading`}>Continue Watching</h2>
        <span>Saved on this installation</span>
      </div>
      <div className="shelf__reel">
        {items.map((bookmark, index) => {
          const title = recordingTitle(bookmark)
          const previous = items[index - 1]
          const next = items[index + 1]
          const failed = removalError?.videoId === bookmark.videoId
          return (
            <article className="continue-card" key={bookmark.videoId}>
              <button
                aria-label={`Continue ${title}`}
                className="continue-card__open"
                data-focus-down={forgetId(bookmark.videoId)}
                data-focus-id={openId(bookmark.videoId)}
                data-focus-left={previous === undefined ? "nav-home" : openId(previous.videoId)}
                data-focus-right={
                  next === undefined ? forgetId(bookmark.videoId) : openId(next.videoId)
                }
                data-focus-up="nav-home"
                data-focusable="true"
                onClick={() => onSelect(bookmark)}
                onFocus={(event) => {
                  focusedCardRef.current = { element: event.currentTarget, index }
                }}
                type="button"
              >
                <strong>{title}</strong>
                <span>
                  {formatTime(bookmark.position)} / {formatTime(bookmark.duration)}
                </span>
              </button>
              <button
                aria-disabled={removingId !== undefined}
                aria-label={`${failed ? "Retry forgetting" : "Forget progress for"} ${title}`}
                data-focus-down={status === "error" ? retryId : lowerFocusId}
                data-focus-id={forgetId(bookmark.videoId)}
                data-focus-left={previous === undefined ? "nav-home" : forgetId(previous.videoId)}
                data-focus-right={next === undefined ? lowerFocusId : forgetId(next.videoId)}
                data-focus-up={openId(bookmark.videoId)}
                data-focusable="true"
                onClick={() => {
                  if (removingId === undefined) onForget(bookmark.videoId)
                }}
                onFocus={(event) => {
                  focusedCardRef.current = { element: event.currentTarget, index }
                }}
                type="button"
              >
                {removingId === bookmark.videoId
                  ? "Forgetting..."
                  : failed
                    ? "Retry forget progress"
                    : "Forget progress"}
              </button>
              {failed ? (
                <p className="error-message" role="alert">
                  {removalError.message}
                </p>
              ) : null}
            </article>
          )
        })}
      </div>
      {feedback}
    </section>
  )
}
