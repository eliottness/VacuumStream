import { MagnifyingGlassIcon, PlayIcon } from "@phosphor-icons/react"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import type { ChannelCard } from "../../../shared/contracts"

type SearchViewProps = {
  readonly authenticated: boolean
  readonly busy: boolean
  readonly onOpen: (channel: ChannelCard) => void
  readonly onSearch: (query: string) => void
  readonly results: readonly ChannelCard[]
}

const KEY_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m", "_"],
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
] as const

type SubmitHandler = NonNullable<ComponentProps<"form">["onSubmit"]>

export const SearchView = ({ authenticated, busy, onOpen, onSearch, results }: SearchViewProps) => {
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const submit: SubmitHandler = (event) => {
    event.preventDefault()
    onSearch(query.trim())
  }
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
      <form className="search-form" onSubmit={submit}>
        <label htmlFor="channel-search">Channel or category</label>
        <div className="field-row">
          <input
            data-focus-id="search-input"
            data-focus-down="search-key-q"
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
            data-focus-id="search-submit"
            data-focus-down="search-key-q"
            data-focus-up="search-input"
            data-focusable="true"
            disabled={busy}
            type="submit"
          >
            <MagnifyingGlassIcon aria-hidden="true" />
            Search
          </button>
        </div>
      </form>
      <fieldset aria-label="On-screen keyboard" className="virtual-keyboard">
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
          onClick={() => setQuery((current) => Array.from(current).slice(0, -1).join(""))}
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
          data-focus-id="search-key-submit"
          data-focusable="true"
          disabled={busy}
          onClick={() => onSearch(query.trim())}
          type="button"
        >
          Search
        </button>
      </fieldset>
      <div className="channel-results" aria-live="polite">
        {results.map((channel) => (
          <button
            className="channel-result"
            data-focus-id={`channel-${channel.id}`}
            data-focusable="true"
            key={channel.id}
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
        ))}
      </div>
    </main>
  )
}
