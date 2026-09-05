import { PlayIcon } from "@phosphor-icons/react"
import type { VideoCard } from "../../../shared/contracts"

type VideoShelfProps = {
  readonly onBack: () => void
  readonly onSelect: (video: VideoCard) => void
  readonly videos: readonly VideoCard[]
}

export const VideoShelf = ({ onBack, onSelect, videos }: VideoShelfProps) => (
  <main className="videos-view">
    <header className="page-heading">
      <button data-focus-id="videos-back" data-focusable="true" onClick={onBack} type="button">
        Back
      </button>
      <h1>Past broadcasts</h1>
      <p>Recent archived streams from this channel.</p>
    </header>
    <div className="video-grid">
      {videos.map((video) => (
        <button
          className="video-card"
          data-focus-id={`video-${video.id}`}
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
  </main>
)
