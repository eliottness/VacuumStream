import { useId } from "react"
import type { StreamCard as StreamCardModel } from "../../../shared/contracts"

type StreamShelfProps = {
  readonly emptyActionLabel?: string
  readonly emptyMessage: string
  readonly onEmptyAction?: () => void
  readonly onRetry?: () => void
  readonly onSelect: (stream: StreamCardModel) => void
  readonly state?: "error" | "loading" | "ready"
  readonly streams: readonly StreamCardModel[]
  readonly title: string
}

const formatViewers = (viewers: number): string =>
  viewers === 0
    ? "Channel preview"
    : `${new Intl.NumberFormat(undefined, { notation: "compact" }).format(viewers)} viewers`

export const StreamShelf = ({
  emptyActionLabel,
  emptyMessage,
  onEmptyAction,
  onRetry,
  onSelect,
  state = "ready",
  streams,
  title,
}: StreamShelfProps) => {
  const headingId = useId()

  return (
    <section className="shelf" aria-labelledby={headingId}>
      <div className="shelf__heading">
        <h2 id={headingId}>{title}</h2>
        <span>{state === "loading" ? "Loading" : `${streams.length} channels`}</span>
      </div>
      {state === "loading" ? (
        <div aria-busy="true" aria-label={`Loading ${title}`} className="shelf__reel" role="status">
          {[0, 1, 2].map((item) => (
            <span className="stream-skeleton" key={item} />
          ))}
        </div>
      ) : null}
      {state === "error" ? (
        <div className="empty-state" role="alert">
          <span>Could not load this shelf.</span>
          {onRetry === undefined ? null : (
            <button data-focusable="true" onClick={onRetry} type="button">
              Try again
            </button>
          )}
        </div>
      ) : null}
      {state === "ready" && streams.length === 0 ? (
        <div className="empty-state">
          <span>{emptyMessage}</span>
          {onEmptyAction === undefined || emptyActionLabel === undefined ? null : (
            <button data-focusable="true" onClick={onEmptyAction} type="button">
              {emptyActionLabel}
            </button>
          )}
        </div>
      ) : null}
      {state === "ready" && streams.length > 0 ? (
        <div className="shelf__reel">
          {streams.map((stream) => (
            <button
              aria-label={`Watch ${stream.userName}: ${stream.title}`}
              className="stream-card"
              data-focus-id={`stream-${stream.id}`}
              data-focusable="true"
              key={stream.id}
              onClick={() => onSelect(stream)}
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
                  </span>
                  {stream.userName}
                </span>
                {stream.category !== stream.userName ? <span>{stream.category}</span> : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
