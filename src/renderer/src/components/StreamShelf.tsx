import { useCallback, useId, useLayoutEffect, useRef } from "react"
import type { StreamCard as StreamCardModel } from "../../../shared/contracts"

type StreamShelfProps = {
  readonly cursor?: string | undefined
  readonly emptyActionFocusId?: string
  readonly emptyActionLabel?: string
  readonly emptyMessage: string
  readonly error?: string
  readonly focusPrefix?: string
  readonly onEmptyAction?: () => void
  readonly onLoadMore?: () => void
  readonly onRefresh?: () => void
  readonly onRetry?: () => void
  readonly onSelect: (stream: StreamCardModel) => void
  readonly refreshing?: boolean
  readonly state?: "error" | "loading" | "ready"
  readonly streams: readonly StreamCardModel[]
  readonly title: string
}

const formatViewers = (viewers: number): string =>
  viewers === 0
    ? "Channel preview"
    : `${new Intl.NumberFormat(undefined, { notation: "compact" }).format(viewers)} viewers`

export const StreamShelf = ({
  cursor,
  emptyActionFocusId,
  emptyActionLabel,
  emptyMessage,
  error = "Could not load this shelf.",
  focusPrefix,
  onEmptyAction,
  onLoadMore,
  onRefresh,
  onRetry,
  onSelect,
  refreshing = false,
  state = "ready",
  streams,
  title,
}: StreamShelfProps) => {
  const headingId = useId()
  const refreshRef = useRef<HTMLButtonElement>(null)
  const actionRef = useRef<HTMLButtonElement | null>(null)
  const keepActionFocus = useCallback((button: HTMLButtonElement | null): void => {
    if (button === null && document.activeElement === actionRef.current) {
      refreshRef.current?.focus()
    }
    actionRef.current = button
  }, [])
  // A refresh replaces the reel, so the focused card can disappear mid-navigation.
  const focusedCardRef = useRef<HTMLButtonElement | null>(null)
  useLayoutEffect(() => {
    const focusedCard = focusedCardRef.current
    if (focusedCard === null || focusedCard.isConnected) return
    focusedCardRef.current = null
    if (document.activeElement !== null && document.activeElement !== document.body) return
    const survivor = reelRef.current?.querySelector<HTMLButtonElement>(".stream-card")
    ;(survivor ?? refreshRef.current)?.focus()
  })
  const reelRef = useRef<HTMLDivElement>(null)
  const prefix = focusPrefix ?? headingId
  const refreshId = `${prefix}-refresh`
  const action = state === "error" ? onRetry : cursor === undefined ? undefined : onLoadMore
  const actionId =
    action === undefined ? undefined : `${prefix}-${state === "error" ? "retry" : "more"}`
  const firstId = streams[0] === undefined ? actionId : `stream-${streams[0].id}`
  const navId = focusPrefix === undefined ? undefined : `nav-${focusPrefix}`

  return (
    <section aria-busy={state === "loading"} aria-labelledby={headingId} className="shelf">
      <div className="shelf__heading">
        <h2 id={headingId}>{title}</h2>
        <div className="shelf__tools">
          <span>{state === "loading" ? "Loading" : `${streams.length} channels`}</span>
          {onRefresh === undefined ? null : (
            <button
              aria-disabled={refreshing}
              data-focus-down={firstId}
              data-focus-id={refreshId}
              data-focus-left={navId}
              data-focus-right={actionId}
              data-focus-up={navId}
              data-focusable="true"
              onClick={() => {
                if (!refreshing) onRefresh()
              }}
              ref={refreshRef}
              type="button"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
      {state === "loading" && streams.length === 0 ? (
        <div aria-busy="true" aria-label={`Loading ${title}`} className="shelf__reel" role="status">
          {[0, 1, 2].map((item) => (
            <span className="stream-skeleton" key={item} />
          ))}
        </div>
      ) : null}
      {state === "loading" && streams.length > 0 ? (
        <p role="status">Updating live streams...</p>
      ) : null}
      {state === "error" ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {state === "ready" && streams.length === 0 ? (
        <div className="empty-state">
          <span>{emptyMessage}</span>
          {onEmptyAction === undefined || emptyActionLabel === undefined ? null : (
            <button
              data-focus-id={emptyActionFocusId}
              data-focus-left={
                emptyActionFocusId === "following-connect" ? "nav-following" : undefined
              }
              data-focusable="true"
              onClick={onEmptyAction}
              type="button"
            >
              {emptyActionLabel}
            </button>
          )}
        </div>
      ) : null}
      {streams.length > 0 ? (
        <div className="shelf__reel" ref={reelRef}>
          {streams.map((stream, index) => (
            <button
              aria-label={`Watch ${stream.userName}: ${stream.title}`}
              className="stream-card"
              data-focus-down={focusPrefix === undefined ? undefined : actionId}
              data-focus-id={`stream-${stream.id}`}
              data-focus-left={
                focusPrefix === undefined
                  ? undefined
                  : index === 0
                    ? navId
                    : `stream-${streams[index - 1]?.id}`
              }
              data-focus-right={
                focusPrefix === undefined
                  ? undefined
                  : index === streams.length - 1
                    ? actionId
                    : `stream-${streams[index + 1]?.id}`
              }
              data-focus-up={onRefresh === undefined ? undefined : refreshId}
              data-focusable="true"
              key={stream.id}
              onClick={() => onSelect(stream)}
              onFocus={(event) => {
                focusedCardRef.current = event.currentTarget
              }}
              type="button"
            >
              <span className="stream-card__art">
                <span className="image-fallback">Preview unavailable</span>
                <img
                  alt=""
                  height="360"
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.hidden = true
                  }}
                  src={stream.thumbnailUrl}
                  width="640"
                />
                <span className="live-badge">Live</span>
                <span className="viewer-badge">{formatViewers(stream.viewerCount)}</span>
              </span>
              <span className="stream-card__copy">
                <strong>{stream.title}</strong>
                <span className="stream-card__identity">
                  <span aria-hidden="true" className="avatar">
                    {stream.userName.slice(0, 1)}
                    {stream.profileImageUrl === undefined ? null : (
                      <img
                        alt=""
                        height="48"
                        key={stream.profileImageUrl}
                        onError={(event) => {
                          event.currentTarget.hidden = true
                        }}
                        src={stream.profileImageUrl}
                        width="48"
                      />
                    )}
                  </span>
                  {stream.userName}
                </span>
                {stream.category !== stream.userName ? <span>{stream.category}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {action === undefined ? null : (
        <button
          aria-disabled={state === "loading"}
          className="shelf__action"
          data-focus-id={actionId}
          data-focus-left={onRefresh === undefined ? navId : refreshId}
          data-focus-up={streams.length === 0 ? refreshId : `stream-${streams.at(-1)?.id}`}
          data-focusable="true"
          onClick={() => {
            if (state !== "loading") action()
          }}
          ref={keepActionFocus}
          type="button"
        >
          {state === "error" ? "Retry" : "Load more"}
        </button>
      )}
    </section>
  )
}
