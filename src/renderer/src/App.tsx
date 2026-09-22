import { BroadcastIcon, SignInIcon } from "@phosphor-icons/react"
import { useEffect, useLayoutEffect, useRef } from "react"
import { CategoryShelf } from "./components/CategoryShelf"
import { CategoryView } from "./components/CategoryView"
import { ContinueWatchingShelf, recordingTitle } from "./components/ContinueWatchingShelf"
import { FavouritesShelf } from "./components/FavouritesShelf"
import { FollowedChannelsView } from "./components/FollowedChannelsView"
import { Navigation, type RouteName } from "./components/Navigation"
import { PlayerView } from "./components/PlayerView"
import { SearchView } from "./components/SearchView"
import { SettingsPanel, settingsAccountFocusId } from "./components/SettingsPanel"
import { StreamShelf } from "./components/StreamShelf"
import { VideoShelf } from "./components/VideoShelf"
import { PREVIEW_STREAMS } from "./demo-data"
import { useControllerNavigation } from "./focus-navigation"
import { homeFocus } from "./home-focus"
import { screenEntryFocusId } from "./screen"
import { useAppController } from "./useAppController"
import { useFavourites } from "./useFavourites"

const ROUTE_TITLES: Readonly<Record<RouteName, string>> = {
  following: "Following",
  home: "Home",
  search: "Search",
  settings: "Settings",
}

export const App = () => {
  useControllerNavigation()
  const controller = useAppController()
  const favourites = useFavourites()
  const accountGeneration = useRef(0)
  const accountContext = useRef({
    auth: controller.auth,
    clientId: controller.settings.clientId,
  })
  const focusedControl = useRef<HTMLElement | null>(null)
  const screenTitle =
    controller.screen.kind === "browse"
      ? ROUTE_TITLES[controller.screen.route]
      : controller.screen.kind === "player"
        ? controller.screen.source.title
        : controller.screen.kind === "category"
          ? controller.screen.name
          : "Past broadcasts"

  useEffect(() => {
    document.title = `${screenTitle} · VacuumStream`
  }, [screenTitle])
  useLayoutEffect(() => {
    const focusId = screenEntryFocusId(controller.screen)
    document.querySelector<HTMLElement>(`[data-focus-id="${focusId}"]`)?.focus()
  }, [controller.screen])
  useLayoutEffect(() => {
    // An upstream auth/settings change also supersedes an in-flight account request.
    if (
      accountContext.current.auth === controller.auth &&
      accountContext.current.clientId === controller.settings.clientId
    )
      return
    accountGeneration.current += 1
    accountContext.current = {
      auth: controller.auth,
      clientId: controller.settings.clientId,
    }
    const previous = focusedControl.current
    if (previous === null || previous.isConnected) return
    if (document.activeElement !== null && document.activeElement !== document.body) return
    // Account completion can remove controls on a different route (for example Home Refresh).
    // Respect any focus recovery already performed by the current screen or its shelves.
    const entryId = screenEntryFocusId(controller.screen)
    const entry = document.querySelector<HTMLElement>(`[data-focus-id="${entryId}"]`)
    const contentId = entry?.getAttribute("data-focus-right")
    const content = document.querySelector<HTMLElement>(
      `[data-focus-id="${contentId}"]:not(:disabled):not([aria-disabled="true"])`,
    )
    ;(content ?? entry)?.focus()
  })
  useLayoutEffect(
    () => () => {
      accountGeneration.current += 1
    },
    [],
  )

  if (controller.screen.kind === "player") {
    return (
      <PlayerView
        key={
          controller.screen.source.kind === "live"
            ? controller.screen.source.channel
            : controller.screen.source.videoId
        }
        onBack={controller.navigateHome}
        onPastBroadcasts={(userId) => void controller.showPastBroadcasts(userId)}
        onToggleFullscreen={() => void window.vacuumStream.system.toggleFullscreen()}
        source={controller.screen.source}
      />
    )
  }

  if (controller.screen.kind === "videos") {
    const { userId } = controller.screen
    return (
      <VideoShelf
        error={controller.videoError}
        loading={controller.busy}
        onBack={() => controller.navigate("home")}
        onRetry={() => void controller.showPastBroadcasts(userId)}
        onSelect={controller.viewVideo}
        videos={controller.videos}
      />
    )
  }

  const route = controller.screen.kind === "browse" ? controller.screen.route : undefined
  const allChannels =
    controller.screen.kind === "browse" && controller.screen.followingMode === "all"
  const home =
    route === "home"
      ? homeFocus(
          controller.auth.kind === "authenticated" ? "authenticated" : "guest",
          controller.continueWatching,
          favourites,
        )
      : undefined

  return (
    <div
      className="app-shell"
      onFocusCapture={(event) => {
        focusedControl.current = event.target
      }}
    >
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <p aria-live="polite" className="visually-hidden">
        {screenTitle}
      </p>
      <Navigation
        active={route ?? "home"}
        entryFocusId={
          home?.entryFocusId ??
          (route === "settings"
            ? settingsAccountFocusId(controller.auth)
            : allChannels
              ? "following-all"
              : controller.auth.kind === "authenticated" &&
                  (route === "home" || route === "following")
                ? `${route}-refresh`
                : undefined)
        }
        onNavigate={controller.navigate}
      />
      <div className="app-shell__content">
        {controller.notice !== "" ? <div className="notice">{controller.notice}</div> : null}
        {controller.screen.kind === "category" ? (
          <CategoryView
            cursor={controller.categoryCatalog.cursor}
            error={controller.categoryCatalog.error}
            name={controller.screen.name}
            onBack={controller.navigateHome}
            onLoadMore={() => void controller.loadMoreCategory()}
            onSelect={controller.openStream}
            status={controller.categoryCatalog.status}
            streams={controller.categoryCatalog.items}
          />
        ) : null}
        {home !== undefined ? (
          <main className="browse-view" id="main-content" tabIndex={-1}>
            <header className="home-heading">
              <div>
                <span>
                  {controller.auth.kind === "authenticated"
                    ? `Welcome, ${controller.auth.displayName}`
                    : "Guest viewing"}
                </span>
                <h1>Live now</h1>
                <p>Pick a signal and settle in.</p>
              </div>
              {controller.auth.kind !== "authenticated" ? (
                <button
                  className="primary-button"
                  data-focus-down={home.signInDownFocusId}
                  data-focus-id="home-sign-in"
                  data-focus-left="nav-home"
                  data-focusable="true"
                  onClick={() => controller.navigate("settings")}
                  type="button"
                >
                  <SignInIcon aria-hidden="true" />
                  Connect Twitch
                </button>
              ) : (
                <BroadcastIcon aria-hidden="true" className="broadcast-mark" weight="duotone" />
              )}
            </header>
            <ContinueWatchingShelf
              {...controller.continueWatching}
              {...home.continueWatching}
              onForget={(videoId) => void controller.continueWatching.forget(videoId)}
              onRetry={() => void controller.continueWatching.retry()}
              onSelect={(bookmark) =>
                controller.viewVideo({
                  id: bookmark.videoId,
                  title: recordingTitle(bookmark),
                  userId: bookmark.details?.userId ?? "0",
                })
              }
            />
            <FavouritesShelf
              {...favourites}
              {...home.favourites}
              onOpen={(entry) =>
                controller.openChannel({
                  displayName: entry.login,
                  id: entry.userId ?? `direct-${entry.login}`,
                  login: entry.login,
                })
              }
              onRemove={(login) => void favourites.remove(login)}
              onRetry={() => void favourites.retry()}
            />
            <StreamShelf
              {...(controller.auth.kind === "authenticated"
                ? {
                    cursor: controller.live.cursor,
                    error: controller.live.error,
                    focusPrefix: "home",
                    onLoadMore: () => void controller.loadMoreShelf("home"),
                    onRefresh: () => void controller.refreshShelf("home"),
                    onRetry: () => void controller.retryShelf("home"),
                    refreshing:
                      controller.live.status === "loading" &&
                      controller.live.operation === "refresh",
                    state: controller.live.status,
                  }
                : {})}
              emptyMessage="No live channels are available right now."
              entryUpperFocusId={home.liveEntryUpperFocusId}
              onSelect={controller.openStream}
              streams={
                controller.auth.kind === "authenticated" ? controller.live.items : PREVIEW_STREAMS
              }
              title={controller.auth.kind === "authenticated" ? "Recommended live" : "Quick watch"}
            />
            <CategoryShelf
              categories={controller.categories}
              onSelect={(category) => void controller.showCategory(category)}
            />
          </main>
        ) : null}
        {route === "following" ? (
          <main className="browse-view" id="main-content" tabIndex={-1}>
            <header className="page-heading">
              <span>Your channels</span>
              <h1>Following</h1>
              <p>Channels from the Twitch account connected to this device.</p>
            </header>
            {allChannels ? null : (
              <StreamShelf
                {...(controller.auth.kind === "authenticated"
                  ? {
                      cursor: controller.followed.cursor,
                      error: controller.followed.error,
                      focusPrefix: "following",
                      onLoadMore: () => void controller.loadMoreShelf("following"),
                      onRefresh: () => void controller.refreshShelf("following"),
                      onRetry: () => void controller.retryShelf("following"),
                      refreshing:
                        controller.followed.status === "loading" &&
                        controller.followed.operation === "refresh",
                      state: controller.followed.status,
                    }
                  : {
                      emptyActionFocusId: "following-connect",
                      emptyActionLabel: "Connect Twitch",
                      onEmptyAction: () => controller.navigate("settings"),
                    })}
                emptyMessage={
                  controller.auth.kind === "authenticated"
                    ? "No followed channels are live right now."
                    : "Connect Twitch to see live channels you follow."
                }
                onSelect={controller.openStream}
                streams={controller.followed.items}
                title="Live from your follows"
              />
            )}
            <fieldset aria-label="Following view" className="following-modes">
              <button
                aria-pressed={!allChannels}
                data-focus-down={allChannels ? "following-directory-refresh" : "following-refresh"}
                data-focus-id="following-live"
                data-focus-left="nav-following"
                data-focus-right="following-all"
                data-focus-up={allChannels ? "nav-following" : "following-refresh"}
                data-focusable="true"
                onClick={() => controller.navigate("following")}
                type="button"
              >
                Live now
              </button>
              <button
                aria-pressed={allChannels}
                data-focus-down={allChannels ? "following-directory-refresh" : "following-refresh"}
                data-focus-id="following-all"
                data-focus-left="following-live"
                data-focus-up={allChannels ? "nav-following" : "following-refresh"}
                data-focusable="true"
                onClick={controller.showAllChannels}
                type="button"
              >
                All channels
              </button>
            </fieldset>
            {allChannels ? (
              <FollowedChannelsView
                channels={controller.followedChannels.items}
                cursor={controller.followedChannels.cursor}
                error={controller.followedChannels.error}
                onLoadMore={() => void controller.loadDirectory("more")}
                onOpen={controller.openChannel}
                onPastBroadcasts={(userId) => void controller.showPastBroadcasts(userId)}
                onRefresh={() => void controller.loadDirectory("refresh")}
                onRetry={() => void controller.loadDirectory("retry")}
                refreshing={
                  controller.followedChannels.status === "loading" &&
                  controller.followedChannels.operation === "refresh"
                }
                status={controller.followedChannels.status}
              />
            ) : null}
          </main>
        ) : null}
        {route === "search" ? (
          <SearchView
            authenticated={controller.auth.kind === "authenticated"}
            busy={controller.busy}
            favourites={favourites}
            onOpen={controller.openChannel}
            onRetryFavourites={() => void favourites.retry()}
            onSave={(channel) =>
              void favourites.add({
                login: channel.login.toLowerCase(),
                ...(channel.id.startsWith("direct-") || channel.id === "0"
                  ? {}
                  : { userId: channel.id }),
              })
            }
            onSearch={(query) => void controller.search(query)}
            results={controller.searchResults}
          />
        ) : null}
        {route === "settings" ? (
          <SettingsPanel
            auth={controller.auth}
            onAccountRequest={() => {
              const generation = ++accountGeneration.current
              return () => generation === accountGeneration.current
            }}
            onAuthChange={controller.setAuth}
            onSettingsChange={controller.updateSettings}
            settings={controller.settings}
          />
        ) : null}
      </div>
    </div>
  )
}
