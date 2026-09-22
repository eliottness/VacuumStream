import { useCallback, useLayoutEffect, useRef } from "react"
import type { Favourite } from "../../../shared/contracts"
import { markControllerFocus } from "../focus-navigation"
import type { FavouritesState } from "../useFavourites"

export const favouritesEntryId = (
  state: Pick<FavouritesState, "items" | "status">,
  prefix = "favourite",
): string | undefined =>
  state.items[0] === undefined
    ? state.status === "error"
      ? `${prefix}-retry`
      : undefined
    : `${prefix}-${state.items[0].login}-open`

type FavouritesShelfProps = FavouritesState & {
  readonly fallbackFocusId: string
  readonly focusPrefix?: string
  readonly lowerFocusId: string
  readonly onOpen: (entry: Favourite) => void
  readonly onRemove: (login: string) => void
  readonly onRetry: () => void
  readonly upperFocusId: string
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

export const FavouritesShelf = ({
  error,
  fallbackFocusId,
  focusPrefix = "favourite",
  items,
  lowerFocusId,
  mutationError,
  onOpen,
  onRemove,
  onRetry,
  pending,
  status,
  upperFocusId,
}: FavouritesShelfProps) => {
  const openId = (login: string): string => `${focusPrefix}-${login}-open`
  const removeId = (login: string): string => `${focusPrefix}-${login}-remove`
  const retryId = `${focusPrefix}-retry`
  const focusedCard = useRef<{ element: HTMLButtonElement; index: number } | undefined>(undefined)
  const actionRef = useRef<HTMLButtonElement | null>(null)
  const failureRef = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    if (mutationError?.operation === "remove") {
      failureRef.current?.scrollIntoView({ behavior: "instant", block: "nearest" })
    }
  }, [mutationError])
  const keepActionFocus = useCallback(
    (button: HTMLButtonElement | null): void => {
      if (button === null && document.activeElement === actionRef.current) focus(fallbackFocusId)
      actionRef.current = button
    },
    [fallbackFocusId],
  )

  useLayoutEffect(() => {
    const previous = focusedCard.current
    if (previous === undefined || previous.element.isConnected) return
    focusedCard.current = undefined
    if (document.activeElement !== null && document.activeElement !== document.body) return
    const next = items[Math.min(previous.index, items.length - 1)]
    focus(next === undefined ? fallbackFocusId : openId(next.login))
  })

  const last = items.at(-1)
  const returnId =
    status === "error" ? retryId : last === undefined ? undefined : removeId(last.login)
  // Compose with the live shelf's existing graph, restoring its edge when we disappear.
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
      {status === "loading" ? <p role="status">Loading local favourites...</p> : null}
      {status === "error" ? (
        <div className="favourites__error">
          <p className="error-message" role="alert">
            {error}
          </p>
          <button
            data-focus-down={lowerFocusId}
            data-focus-id={retryId}
            data-focus-left="nav-home"
            data-focus-right={items[0] === undefined ? lowerFocusId : openId(items[0].login)}
            data-focus-up={last === undefined ? upperFocusId : removeId(last.login)}
            data-focusable="true"
            onClick={onRetry}
            ref={keepActionFocus}
            type="button"
          >
            Retry favourites
          </button>
        </div>
      ) : null}
    </>
  )

  if (items.length === 0) {
    return status === "ready" ? null : <div className="favourites-status">{feedback}</div>
  }

  return (
    <section
      aria-busy={status === "loading"}
      aria-labelledby={`${focusPrefix}-heading`}
      className="shelf favourites"
    >
      <div className="shelf__heading">
        <h2 id={`${focusPrefix}-heading`}>Favourite channels</h2>
      </div>
      <p>Local to this installation, shared across accounts. Not your Twitch follows.</p>
      <div className="shelf__reel">
        {items.map((entry, index) => {
          const previous = items[index - 1]
          const next = items[index + 1]
          const failed =
            mutationError?.operation === "remove" && mutationError.login === entry.login
          return (
            <article className="favourite-card" key={entry.login}>
              <strong>{entry.login}</strong>
              <button
                aria-label={`Open channel ${entry.login}`}
                data-focus-down={removeId(entry.login)}
                data-focus-id={openId(entry.login)}
                data-focus-left={previous === undefined ? "nav-home" : openId(previous.login)}
                data-focus-right={next === undefined ? removeId(entry.login) : openId(next.login)}
                data-focus-up={upperFocusId}
                data-focusable="true"
                onClick={() => onOpen(entry)}
                onFocus={(event) => {
                  focusedCard.current = { element: event.currentTarget, index }
                }}
                type="button"
              >
                Open channel
              </button>
              <button
                aria-disabled={pending !== undefined}
                aria-label={`${failed ? "Retry removing" : "Remove favourite"} ${entry.login}`}
                data-focus-down={status === "error" ? retryId : lowerFocusId}
                data-focus-id={removeId(entry.login)}
                data-focus-left={previous === undefined ? "nav-home" : removeId(previous.login)}
                data-focus-right={next === undefined ? lowerFocusId : removeId(next.login)}
                data-focus-up={openId(entry.login)}
                data-focusable="true"
                onClick={() => {
                  if (pending === undefined) onRemove(entry.login)
                }}
                onFocus={(event) => {
                  focusedCard.current = { element: event.currentTarget, index }
                }}
                type="button"
              >
                {pending?.operation === "remove" && pending.login === entry.login
                  ? "Removing..."
                  : failed
                    ? "Retry remove favourite"
                    : "Remove favourite"}
              </button>
              {failed ? (
                <p className="error-message" ref={failureRef} role="alert">
                  {mutationError.message}
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
