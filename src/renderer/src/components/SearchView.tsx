import { MagnifyingGlassIcon, PlayIcon } from "@phosphor-icons/react"
import { useEffect, useEffectEvent, useRef, useState } from "react"
import type { ChannelCard } from "../../../shared/contracts"
import { SEARCH_GAMEPAD_EVENT, type SearchGamepadAction } from "../focus-navigation"
import type { FavouritesState } from "../useFavourites"

type SearchViewProps = {
  readonly authenticated: boolean
  readonly busy: boolean
  readonly favourites: FavouritesState
  readonly onOpen: (channel: ChannelCard) => void
  readonly onRetryFavourites: () => void
  readonly onSave: (channel: ChannelCard) => void
  readonly onSearch: (query: string) => void
  readonly results: readonly ChannelCard[]
}

const KEY_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m", "_"],
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
] as const

export const SearchView = ({
  authenticated,
  busy,
  favourites,
  onOpen,
  onRetryFavourites,
  onSave,
  onSearch,
  results,
}: SearchViewProps) => {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const keyboardRef = useRef<HTMLFieldSetElement>(null)
  const failureRef = useRef<HTMLParagraphElement>(null)
  const firstResultId = results[0] === undefined ? undefined : `channel-${results[0].id}`
  const resultsEntryId = favourites.status === "error" ? "search-favourites-retry" : firstResultId
  useEffect(() => inputRef.current?.focus(), [])
  useEffect(() => {
    if (favourites.mutationError?.operation === "add") {
      failureRef.current?.scrollIntoView({ behavior: "instant", block: "nearest" })
    }
  }, [favourites.mutationError])
  const deleteLastCharacter = (): void => {
    setQuery((current) => Array.from(current).slice(0, -1).join(""))
  }
  const submit = (): void => {
    const trimmedQuery = query.trim()
    if (busy || trimmedQuery === "") return
    onSearch(trimmedQuery)
  }
  const onGamepadSearch = useEffectEvent((event: Event): void => {
    event.preventDefault()
    const { detail } = event as CustomEvent<SearchGamepadAction>
    if (detail === "delete") deleteLastCharacter()
    else submit()
  })
  useEffect(() => {
    const regions = [formRef.current, keyboardRef.current]
    for (const region of regions) region?.addEventListener(SEARCH_GAMEPAD_EVENT, onGamepadSearch)
    return () => {
      for (const region of regions)
        region?.removeEventListener(SEARCH_GAMEPAD_EVENT, onGamepadSearch)
    }
  }, [])
  return (
    <main className="search-view" id="main-content" tabIndex={-1}>
      <header className="page-heading">
        <span>Find a channel</span>
        <h1>Search Twitch</h1>
        <p>
          {authenticated
            ? "Search channels and categories across Twitch."
            : "Signed-out searches can still open an exact Twitch channel name."}
        </p>
      </header>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        ref={formRef}
      >
        <label htmlFor="channel-search">Channel or category</label>
        <div className="field-row">
          <input
            aria-describedby="search-gamepad-hint"
            data-focus-down="search-key-q"
            data-focus-id="search-input"
            data-focus-left="nav-search"
            data-focus-right="search-submit"
            data-focus-up="nav-search"
            data-focusable="true"
            id="channel-search"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Channel name"
            ref={inputRef}
            value={query}
          />
          <button
            data-focus-down={resultsEntryId ?? "search-key-q"}
            data-focus-id="search-submit"
            data-focus-up="search-input"
            data-focusable="true"
            disabled={busy}
            type="submit"
          >
            <MagnifyingGlassIcon aria-hidden="true" />
            Search
          </button>
        </div>
        <p id="search-gamepad-hint">
          Native gamepad: west face (X on Xbox) deletes the last character; north face (Y on Xbox)
          searches. Keyboard and Steam Input keyboard mappings are unchanged.
        </p>
      </form>
      <fieldset aria-label="On-screen keyboard" className="virtual-keyboard" ref={keyboardRef}>
        {KEY_ROWS.flatMap((row, rowIndex) =>
          row.map((key) => (
            <button
              aria-label={`Type ${key}`}
              data-focus-id={`search-key-${key}`}
              data-focus-up={rowIndex === 0 ? "search-input" : undefined}
              data-focusable="true"
              key={key}
              onClick={() => setQuery((current) => `${current}${key}`.slice(0, 100))}
              type="button"
            >
              {key.toUpperCase()}
            </button>
          )),
        )}
        <button
          aria-label="Type space"
          className="virtual-keyboard__space"
          data-focus-id="search-key-space"
          data-focusable="true"
          onClick={() => setQuery((current) => `${current} `.slice(0, 100))}
          type="button"
        >
          Space
        </button>
        <button
          aria-label="Backspace"
          className="virtual-keyboard__backspace"
          data-focus-id="search-key-backspace"
          data-focusable="true"
          onClick={deleteLastCharacter}
          type="button"
        >
          Backspace
        </button>
        <button
          className="virtual-keyboard__clear"
          data-focus-id="search-key-clear"
          data-focusable="true"
          onClick={() => setQuery("")}
          type="button"
        >
          Clear
        </button>
        <button
          className="virtual-keyboard__submit"
          data-focus-down={resultsEntryId}
          data-focus-id="search-key-submit"
          data-focusable="true"
          disabled={busy}
          onClick={submit}
          type="button"
        >
          Search
        </button>
      </fieldset>
      {favourites.status === "loading" ? <p role="status">Loading local favourites...</p> : null}
      {favourites.status === "error" ? (
        <div className="favourites__error">
          <p className="error-message" role="alert">
            {favourites.error}
          </p>
          <button
            data-focus-down={firstResultId}
            data-focus-id="search-favourites-retry"
            data-focus-left="nav-search"
            data-focus-right={firstResultId}
            data-focus-up="search-submit"
            data-focusable="true"
            onClick={() => {
              const fallback = busy
                ? inputRef.current
                : formRef.current?.querySelector<HTMLButtonElement>(
                    '[data-focus-id="search-submit"]',
                  )
              fallback?.focus()
              onRetryFavourites()
            }}
            type="button"
          >
            Retry favourites
          </button>
        </div>
      ) : null}
      <div aria-live="polite" className="channel-results">
        {results.map((channel, index) => {
          const saved = favourites.items.some(
            (entry) => entry.login === channel.login.toLowerCase(),
          )
          const saving =
            favourites.pending?.operation === "add" &&
            favourites.pending.login === channel.login.toLowerCase()
          const failed =
            favourites.mutationError?.operation === "add" &&
            favourites.mutationError.login === channel.login.toLowerCase()
          const previous = results[index - 1]
          const next = results[index + 1]
          const upId = previous === undefined ? "search-submit" : `channel-${previous.id}`
          const downId = next === undefined ? "search-key-submit" : `channel-${next.id}`
          return (
            <article className="channel-result-actions" key={channel.id}>
              <button
                className="channel-result"
                data-focus-down={downId}
                data-focus-id={`channel-${channel.id}`}
                data-focus-left="nav-search"
                data-focus-right={`channel-${channel.id}-save`}
                data-focus-up={upId}
                data-focusable="true"
                onClick={() => onOpen(channel)}
                type="button"
              >
                <img alt="" height="96" src={channel.thumbnailUrl} width="96" />
                <span>
                  <strong>{channel.displayName}</strong>
                  <span>{channel.isLive ? `Live in ${channel.category}` : "Channel"}</span>
                  <span>{channel.title}</span>
                </span>
                <PlayIcon aria-hidden="true" weight="fill" />
              </button>
              <button
                aria-disabled={saved || favourites.pending !== undefined}
                aria-label={`${saved ? "Saved favourite" : failed ? "Retry saving" : "Save favourite"} ${channel.login}`}
                aria-pressed={saved}
                data-focus-down={downId}
                data-focus-id={`channel-${channel.id}-save`}
                data-focus-left={`channel-${channel.id}`}
                data-focus-up={upId}
                data-focusable="true"
                onClick={() => {
                  if (!saved && favourites.pending === undefined) onSave(channel)
                }}
                type="button"
              >
                {saved
                  ? "Saved favourite"
                  : saving
                    ? "Saving..."
                    : failed
                      ? "Retry save favourite"
                      : "Save favourite"}
              </button>
              {failed ? (
                <p className="error-message" ref={failureRef} role="alert">
                  {favourites.mutationError?.message}
                </p>
              ) : null}
            </article>
          )
        })}
      </div>
    </main>
  )
}
