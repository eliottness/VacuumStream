import { BroadcastIcon, SignInIcon } from "@phosphor-icons/react"
import { useEffect, useLayoutEffect } from "react"
import { CategoryShelf } from "./components/CategoryShelf"
import { CategoryView } from "./components/CategoryView"
import { FollowedChannelsView } from "./components/FollowedChannelsView"
import { Navigation, type RouteName } from "./components/Navigation"
import { PlayerView } from "./components/PlayerView"
import { SearchView } from "./components/SearchView"
import { SettingsPanel } from "./components/SettingsPanel"
import { StreamShelf } from "./components/StreamShelf"
import { VideoShelf } from "./components/VideoShelf"
import { PREVIEW_STREAMS } from "./demo-data"
import { useControllerNavigation } from "./focus-navigation"
import { screenEntryFocusId } from "./screen"
import { useAppController } from "./useAppController"

const ROUTE_TITLES: Readonly<Record<RouteName, string>> = {
  following: "Following",
  home: "Home",
  search: "Search",
  settings: "Settings",
}

export const App = () => {
  useControllerNavigation()
  const controller = useAppController()
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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <p aria-live="polite" className="visually-hidden">
        {screenTitle}
      </p>
      <Navigation
        active={route ?? "home"}
        entryFocusId={
          allChannels
            ? "following-all"
            : controller.auth.kind === "authenticated" &&
                (route === "home" || route === "following")
              ? `${route}-refresh`
              : undefined
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
        {route === "home" ? (
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
                  data-focus-down="stream-preview-twitch"
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
            onOpen={controller.openChannel}
            onSearch={(query) => void controller.search(query)}
            results={controller.searchResults}
          />
        ) : null}
        {route === "settings" ? (
          <SettingsPanel
            auth={controller.auth}
            onAuthChange={controller.setAuth}
            onSettingsChange={controller.updateSettings}
            settings={controller.settings}
          />
        ) : null}
      </div>
    </div>
  )
}
