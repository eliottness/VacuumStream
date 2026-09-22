import { PlayIcon } from "@phosphor-icons/react"
import { useCallback, useRef } from "react"
import type { VideoCard } from "../../../shared/contracts"

type VideoShelfProps = {
  readonly error: string
  readonly loading: boolean
  readonly onBack: () => void
  readonly onRetry: () => void
  readonly onSelect: (video: VideoCard) => void
  readonly videos: readonly VideoCard[]
}

export const VideoShelf = ({
  error,
  loading,
  onBack,
  onRetry,
  onSelect,
  videos,
}: VideoShelfProps) => {
  const backRef = useRef<HTMLButtonElement>(null)
  const retryRef = useRef<HTMLButtonElement | null>(null)
  const keepRetryFocus = useCallback((button: HTMLButtonElement | null): void => {
    if (button === null && document.activeElement === retryRef.current) backRef.current?.focus()
    retryRef.current = button
  }, [])
  const first = videos[0]
  const entryId =
    error !== "" ? "videos-retry" : first === undefined ? undefined : `video-${first.id}`

  return (
    <main aria-busy={loading} className="videos-view">
      <header className="page-heading">
        <button
          data-focus-down={loading ? undefined : entryId}
          data-focus-id="videos-back"
          data-focusable="true"
          onClick={onBack}
          ref={backRef}
          type="button"
        >
          Back
        </button>
        <h1>Past broadcasts</h1>
        <p>Recent archived streams from this channel.</p>
      </header>
      {loading ? (
        <p role="status">Loading past broadcasts...</p>
      ) : error !== "" ? (
        <div>
          <p className="error-message" role="alert">
            {error}
          </p>
          <button
            data-focus-id="videos-retry"
            data-focus-up="videos-back"
            data-focusable="true"
            onClick={onRetry}
            ref={keepRetryFocus}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : videos.length === 0 ? (
        <p className="empty-state" role="status">
          This channel has no past broadcasts available.
        </p>
      ) : (
        <div className="video-grid">
          {videos.map((video) => (
            <button
              className="video-card"
              data-focus-id={`video-${video.id}`}
              data-focus-up="videos-back"
              data-focusable="true"
              key={video.id}
              onClick={() => onSelect(video)}
              type="button"
            >
              <span>
                <img alt="" height="360" src={video.thumbnailUrl} width="640" />
                <PlayIcon aria-hidden="true" weight="fill" />
                <small>{video.duration}</small>
              </span>
              <strong>{video.title}</strong>
              <small>{video.userName}</small>
            </button>
          ))}
        </div>
      )}
    </main>
  )
}
