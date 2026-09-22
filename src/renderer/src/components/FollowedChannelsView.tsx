import { useCallback, useId, useLayoutEffect, useRef } from "react"
import type { FollowedChannelCard } from "../../../shared/contracts"

type FollowedChannelsViewProps = {
  readonly channels: readonly FollowedChannelCard[]
  readonly cursor: string | undefined
  readonly error: string
  readonly onLoadMore: () => void
  readonly onOpen: (channel: FollowedChannelCard) => void
  readonly onPastBroadcasts: (userId: string) => void
  readonly onRefresh: () => void
  readonly onRetry: () => void
  readonly refreshing: boolean
  readonly status: "error" | "loading" | "ready"
}

const openId = (id: string): string => `followed-channel-${id}-open`
const videosId = (id: string): string => `followed-channel-${id}-videos`

export const FollowedChannelsView = ({
  channels,
  cursor,
  error,
  onLoadMore,
  onOpen,
  onPastBroadcasts,
  onRefresh,
  onRetry,
  refreshing,
  status,
}: FollowedChannelsViewProps) => {
  const headingId = useId()
  const refreshRef = useRef<HTMLButtonElement>(null)
  const actionRef = useRef<HTMLButtonElement | null>(null)
  const keepActionFocus = useCallback((button: HTMLButtonElement | null): void => {
    if (button === null && document.activeElement === actionRef.current) {
      refreshRef.current?.focus()
    }
    actionRef.current = button
  }, [])
  const focusedCardRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLUListElement>(null)
  useLayoutEffect(() => {
    const focusedCard = focusedCardRef.current
    if (focusedCard === null || focusedCard.isConnected) return
    focusedCardRef.current = null
    if (document.activeElement !== null && document.activeElement !== document.body) return
    const survivor = listRef.current?.querySelector<HTMLButtonElement>("button")
    ;(survivor ?? refreshRef.current)?.focus()
  })
  const refreshId = "following-directory-refresh"
  const action = status === "error" ? onRetry : cursor === undefined ? undefined : onLoadMore
  const actionId =
    action === undefined
      ? undefined
      : `following-directory-${status === "error" ? "retry" : "more"}`
  const first = channels[0]
  const last = channels.at(-1)

  return (
    <section
      aria-busy={status === "loading"}
      aria-labelledby={headingId}
      className="shelf followed-channels"
    >
      <div className="shelf__heading">
        <h2 id={headingId}>All followed channels</h2>
        <div className="shelf__tools">
          <span>{status === "loading" ? "Loading" : `${channels.length} channels`}</span>
          <button
            aria-disabled={refreshing}
            data-focus-down={first === undefined ? actionId : openId(first.id)}
            data-focus-id={refreshId}
            data-focus-left="nav-following"
            data-focus-right={actionId}
            data-focus-up="following-all"
            data-focusable="true"
            onClick={() => {
              if (!refreshing) onRefresh()
            }}
            ref={refreshRef}
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>
      {status === "loading" ? <p role="status">Loading followed channels...</p> : null}
      {status === "error" ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {status === "ready" && channels.length === 0 ? (
        <p className="empty-state" role="status">
          You are not following any channels yet.
        </p>
      ) : null}
      {channels.length === 0 ? null : (
        <ul className="followed-channels__list" ref={listRef}>
          {channels.map((channel, index) => {
            const previous = channels[index - 1]
            const next = channels[index + 1]
            return (
              <li className="followed-channel" key={channel.id}>
                <span aria-hidden="true" className="avatar">
                  {channel.displayName.slice(0, 1)}
                  {channel.profileImageUrl === undefined ? null : (
                    <img
                      alt=""
                      height="64"
                      key={channel.profileImageUrl}
                      loading="lazy"
                      onError={(event) => {
                        event.currentTarget.hidden = true
                      }}
                      src={channel.profileImageUrl}
                      width="64"
                    />
                  )}
                </span>
                <div className="followed-channel__identity">
                  <h3>{channel.displayName}</h3>
                  <span className={channel.isLive ? "followed-channel__live" : undefined}>
                    {channel.isLive ? "Live" : "Offline"}
                  </span>
                </div>
                <div className="followed-channel__actions">
                  <button
                    aria-label={`Open channel ${channel.displayName}`}
                    data-focus-down={next === undefined ? actionId : openId(next.id)}
                    data-focus-id={openId(channel.id)}
                    data-focus-left="nav-following"
                    data-focus-right={videosId(channel.id)}
                    data-focus-up={previous === undefined ? refreshId : openId(previous.id)}
                    data-focusable="true"
                    onClick={() => onOpen(channel)}
                    onFocus={(event) => {
                      focusedCardRef.current = event.currentTarget
                    }}
                    type="button"
                  >
                    Open channel
                  </button>
                  <button
                    aria-label={`Past broadcasts from ${channel.displayName}`}
                    data-focus-down={next === undefined ? actionId : videosId(next.id)}
                    data-focus-id={videosId(channel.id)}
                    data-focus-left={openId(channel.id)}
                    data-focus-up={previous === undefined ? refreshId : videosId(previous.id)}
                    data-focusable="true"
                    onClick={() => onPastBroadcasts(channel.id)}
                    onFocus={(event) => {
                      focusedCardRef.current = event.currentTarget
                    }}
                    type="button"
                  >
                    Past broadcasts
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {action === undefined ? null : (
        <button
          aria-disabled={status === "loading"}
          className="shelf__action"
          data-focus-id={actionId}
          data-focus-left={refreshId}
          data-focus-up={last === undefined ? refreshId : openId(last.id)}
          data-focusable="true"
          onClick={() => {
            if (status !== "loading") action()
          }}
          ref={keepActionFocus}
          type="button"
        >
          {status === "error" ? "Retry" : "Load more"}
        </button>
      )}
    </section>
  )
}
