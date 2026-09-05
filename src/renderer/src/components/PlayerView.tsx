import { ArrowLeftIcon, CornersOutIcon, FilmStripIcon } from "@phosphor-icons/react"
import { useState } from "react"

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
  const query = new URLSearchParams({ autoplay: "true", parent: "localhost" })
  if (source.kind === "live") {
    query.set("channel", source.channel)
  } else {
    query.set("video", `v${source.videoId}`)
  }
  const sourceUrl = `https://player.twitch.tv/?${query.toString()}`

  return (
    <main className="player-view">
      <header className="player-toolbar">
        <button data-focus-id="player-back" data-focusable="true" onClick={onBack} type="button">
          <ArrowLeftIcon aria-hidden="true" />
          Back
        </button>
        <div>
          <strong>{source.title}</strong>
          <span>{source.kind === "live" ? "Live on Twitch" : "Past broadcast"}</span>
        </div>
        <button
          data-focus-id="player-vods"
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
            Twitch player could not be loaded.
          </div>
        ) : null}
        <iframe
          allow="autoplay; fullscreen"
          height="720"
          onError={() => setFrameState("error")}
          onLoad={() => setFrameState("ready")}
          referrerPolicy="strict-origin-when-cross-origin"
          src={sourceUrl}
          title={`Twitch player: ${source.title}`}
          width="1280"
        />
      </div>
    </main>
  )
}
