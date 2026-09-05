import { MagnifyingGlassIcon, PlayIcon } from "@phosphor-icons/react"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import type { ChannelCard } from "../../../shared/contracts"

type SearchViewProps = {
  readonly busy: boolean
  readonly onOpen: (channel: ChannelCard) => void
  readonly onSearch: (query: string) => void
  readonly results: readonly ChannelCard[]
}

type SubmitHandler = NonNullable<ComponentProps<"form">["onSubmit"]>

export const SearchView = ({ busy, onOpen, onSearch, results }: SearchViewProps) => {
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
        <p>Signed-out searches can still open an exact Twitch channel name.</p>
      </header>
      <form className="search-form" onSubmit={submit}>
        <label htmlFor="channel-search">Channel or category</label>
        <div className="field-row">
          <input
            data-focus-id="search-input"
            data-focusable="true"
            id="channel-search"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Channel name"
            ref={inputRef}
            value={query}
          />
          <button data-focus-id="search-submit" data-focusable="true" disabled={busy} type="submit">
            <MagnifyingGlassIcon aria-hidden="true" />
            Search
          </button>
        </div>
      </form>
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
