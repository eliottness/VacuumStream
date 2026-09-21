import { ArrowLeftIcon } from "@phosphor-icons/react"
import { useCallback, useRef } from "react"
import type { StreamCard } from "../../../shared/contracts"
import { StreamShelf } from "./StreamShelf"

type CategoryViewProps = {
  readonly cursor: string | undefined
  readonly error: string
  readonly name: string
  readonly onBack: () => void
  readonly onLoadMore: () => void
  readonly onSelect: (stream: StreamCard) => void
  readonly status: "error" | "loading" | "ready"
  readonly streams: readonly StreamCard[]
}

export const CategoryView = ({
  cursor,
  error,
  name,
  onBack,
  onLoadMore,
  onSelect,
  status,
  streams,
}: CategoryViewProps) => {
  const backRef = useRef<HTMLButtonElement>(null)
  const actionRef = useRef<HTMLButtonElement | null>(null)
  const keepActionFocus = useCallback((button: HTMLButtonElement | null): void => {
    if (button === null && document.activeElement === actionRef.current) {
      backRef.current?.focus()
    }
    actionRef.current = button
  }, [])
  const actionId = status === "error" ? "category-retry" : "category-more"
  const firstStream = streams[0]

  return (
    <main className="browse-view category-view" id="main-content" tabIndex={-1}>
      <header className="page-heading">
        <div className="category-view__heading">
          <h1>{name}</h1>
          <p>Live streams in this category.</p>
        </div>
        <button
          className="category-view__back"
          data-focus-down={firstStream === undefined ? actionId : `stream-${firstStream.id}`}
          data-focus-id="category-back"
          data-focus-left="nav-home"
          data-focusable="true"
          onClick={onBack}
          ref={backRef}
          type="button"
        >
          <ArrowLeftIcon aria-hidden="true" />
          Back
        </button>
      </header>
      <div aria-busy={status === "loading"} className="category-view__results">
        {status !== "error" || streams.length > 0 ? (
          <StreamShelf
            emptyMessage="No channels are live in this category right now."
            onSelect={onSelect}
            state={status === "loading" && streams.length === 0 ? "loading" : "ready"}
            streams={streams}
            title="Live channels"
          />
        ) : null}
        {status === "loading" && streams.length > 0 ? (
          <p role="status">Loading more live streams...</p>
        ) : null}
        {status === "error" ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}
        {cursor !== undefined || status === "error" ? (
          <button
            aria-disabled={status === "loading"}
            className="category-view__action"
            data-focus-id={actionId}
            data-focus-up={streams.length === 0 ? "category-back" : `stream-${streams.at(-1)?.id}`}
            data-focusable="true"
            onClick={() => {
              if (status !== "loading") onLoadMore()
            }}
            ref={keepActionFocus}
            type="button"
          >
            {status === "error" ? "Retry" : "Load more"}
          </button>
        ) : null}
      </div>
    </main>
  )
}
