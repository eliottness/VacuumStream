import type { PlaybackBookmark, VideoCard } from "../../shared/contracts"
import { CategoryShelf } from "./components/CategoryShelf"
import { ContinueWatchingShelf } from "./components/ContinueWatchingShelf"
import { FavouritesShelf } from "./components/FavouritesShelf"
import { StreamShelf } from "./components/StreamShelf"
import { VideoResumePrompt } from "./components/VideoResumePrompt"
import { VideoShelf } from "./components/VideoShelf"
import { PREVIEW_CATEGORIES, PREVIEW_STREAMS } from "./demo-data"
import { useControllerNavigation } from "./focus-navigation"

const PREVIEW_VIDEOS = [
  {
    createdAt: "2026-09-21T12:00:00Z",
    duration: "1h",
    id: "preview-recording",
    publishedAt: "2026-09-21T12:00:00Z",
    // A bundled asset so the loaded-artwork card is a real comparison for the placeholder.
    thumbnailUrl: new URL("signal-preview.svg", location.origin).href,
    title: "An archived stream",
    userId: "preview",
    userLogin: "preview",
    userName: "Preview channel",
    viewCount: 42,
  },
  {
    createdAt: "2026-09-20T12:00:00Z",
    duration: "30m",
    id: "preview-no-artwork",
    publishedAt: "2026-09-20T12:00:00Z",
    title: "A recording without artwork",
    userId: "preview",
    userLogin: "preview",
    userName: "Preview channel",
    viewCount: 12,
  },
  {
    createdAt: "2026-09-19T12:00:00Z",
    duration: "45m",
    id: "preview-invalid-artwork",
    publishedAt: "2026-09-19T12:00:00Z",
    thumbnailUrl: "data:image/png;base64,AA==",
    title: "A recording with invalid artwork",
    userId: "preview",
    userLogin: "preview",
    userName: "Preview channel",
    viewCount: 8,
  },
] satisfies readonly VideoCard[]

const PREVIEW_BOOKMARKS: readonly PlaybackBookmark[] = [
  {
    details: { title: "A quiet evening building a world together", userId: "preview" },
    duration: 10_800,
    position: 3900,
    updatedAt: 2,
    videoId: "preview-recording",
  },
  { duration: 3600, position: 65, updatedAt: 1, videoId: "123456789" },
]

export const Showcase = () => {
  useControllerNavigation()
  return (
    <main className="showcase">
      <header className="page-heading">
        <span>Development surface</span>
        <h1>Primitive showcase</h1>
        <p>Focus, loading, empty, disabled, and content states for visual QA.</p>
      </header>
      <section className="showcase__buttons" aria-labelledby="buttons-heading">
        <h2 id="buttons-heading">Actions</h2>
        <button className="primary-button" data-focusable="true" type="button">
          Primary action
        </button>
        <button data-focusable="true" type="button">
          Secondary action
        </button>
        <button data-focusable="true" disabled type="button">
          Disabled action
        </button>
        <button className="showcase-focus-sample" data-focusable="true" type="button">
          Focus sample
        </button>
      </section>
      {(["populated", "legacy-entry", "loading", "read-error", "removal-error"] as const).map(
        (fixture) => (
          <div className="showcase__continue" key={fixture}>
            <h2>{fixture}</h2>
            <ContinueWatchingShelf
              error={fixture === "read-error" ? "Could not read local playback progress." : ""}
              fallbackFocusId={`showcase-${fixture}-home`}
              focusPrefix={`showcase-${fixture}`}
              items={
                fixture === "loading" || fixture === "read-error"
                  ? []
                  : fixture === "legacy-entry"
                    ? PREVIEW_BOOKMARKS.slice(1)
                    : PREVIEW_BOOKMARKS
              }
              lowerFocusId={`showcase-${fixture}-home`}
              onForget={() => undefined}
              onRetry={() => undefined}
              onSelect={() => undefined}
              removalError={
                fixture === "removal-error"
                  ? {
                      message: "Could not delete the saved position. Try again.",
                      videoId: "preview-recording",
                    }
                  : undefined
              }
              removingId={undefined}
              status={
                fixture === "loading" ? "loading" : fixture === "read-error" ? "error" : "ready"
              }
            />
            <button data-focus-id={`showcase-${fixture}-home`} data-focusable="true" type="button">
              Home control
            </button>
          </div>
        ),
      )}
      {(["populated", "empty", "loading", "error", "removal-error"] as const).map((fixture) => (
        <div className="showcase__favourites" key={fixture}>
          <h2>Favourites: {fixture}</h2>
          <FavouritesShelf
            error={fixture === "error" ? "Could not read local favourites." : ""}
            fallbackFocusId={`showcase-favourites-${fixture}-home`}
            focusPrefix={`showcase-favourites-${fixture}`}
            items={
              fixture === "populated" || fixture === "removal-error"
                ? [{ login: "twitch" }, { login: "very_long_channel_login_25", userId: "123" }]
                : []
            }
            lowerFocusId={`showcase-favourites-${fixture}-home`}
            mutationError={
              fixture === "removal-error"
                ? {
                    login: "twitch",
                    message: "Could not remove this favourite. Try again.",
                    operation: "remove",
                  }
                : undefined
            }
            onOpen={() => undefined}
            onRemove={() => undefined}
            onRetry={() => undefined}
            pending={undefined}
            status={fixture === "loading" ? "loading" : fixture === "error" ? "error" : "ready"}
            upperFocusId={`showcase-favourites-${fixture}-home`}
          />
          <button
            data-focus-id={`showcase-favourites-${fixture}-home`}
            data-focusable="true"
            type="button"
          >
            Home control
          </button>
        </div>
      ))}
      <StreamShelf
        emptyMessage="No live channels are available."
        onSelect={() => undefined}
        streams={PREVIEW_STREAMS}
        title="Live card states"
      />
      <VideoShelf
        error=""
        loading={false}
        onBack={() => undefined}
        onRetry={() => undefined}
        onSelect={() => undefined}
        videos={PREVIEW_VIDEOS}
      />
      <StreamShelf
        emptyMessage=""
        onSelect={() => undefined}
        state="loading"
        streams={[]}
        title="Loading state"
      />
      <StreamShelf
        emptyMessage=""
        onRetry={() => undefined}
        onSelect={() => undefined}
        state="error"
        streams={[]}
        title="Error state"
      />
      <StreamShelf
        emptyMessage="Follow channels on Twitch to see them here."
        onSelect={() => undefined}
        streams={[]}
        title="Empty state"
      />
      <VideoResumePrompt
        focusOnMount={false}
        focusPrefix="showcase-resume"
        onBack={() => undefined}
        onResume={() => undefined}
        onStartOver={() => undefined}
        position={3900}
        title="Resume a part-watched recording"
      />
      <VideoResumePrompt
        error="Could not read local playback progress. You can still play without resuming."
        focusOnMount={false}
        focusPrefix="showcase-resume-error"
        onBack={() => undefined}
        onStartOver={() => undefined}
        title="Playback progress unavailable"
      />
      <VideoResumePrompt
        focusOnMount={false}
        focusPrefix="showcase-resume-loading"
        loading
        onBack={() => undefined}
        title="Checking a recording"
      />
      <CategoryShelf categories={PREVIEW_CATEGORIES} onSelect={() => undefined} />
    </main>
  )
}
