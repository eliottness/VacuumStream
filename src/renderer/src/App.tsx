import { BroadcastIcon, SignInIcon } from "@phosphor-icons/react"
import { useEffect, useLayoutEffect } from "react"
import { CategoryShelf } from "./components/CategoryShelf"
import { Navigation, type RouteName } from "./components/Navigation"
import { PlayerView } from "./components/PlayerView"
import { SearchView } from "./components/SearchView"
import { SettingsPanel } from "./components/SettingsPanel"
import { StreamShelf } from "./components/StreamShelf"
import { VideoShelf } from "./components/VideoShelf"
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
        onBack={() => controller.navigate("home")}
        onPastBroadcasts={(userId) => void controller.showPastBroadcasts(userId)}
        onToggleFullscreen={() => void window.vacuumStream.system.toggleFullscreen()}
        source={controller.screen.source}
      />
    )
  }

  if (controller.screen.kind === "videos") {
    return (
      <VideoShelf
        onBack={() => controller.navigate("home")}
        onSelect={controller.viewVideo}
        videos={controller.videos}
      />
    )
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <p aria-live="polite" className="visually-hidden">
        {screenTitle}
      </p>
      <Navigation active={controller.screen.route} onNavigate={controller.navigate} />
      <div className="app-shell__content">
        {controller.notice !== "" ? <div className="notice">{controller.notice}</div> : null}
        {controller.screen.route === "home" ? (
          <main className="browse-view" id="main-content" tabIndex={-1}>
            <header className="home-heading">
              <div>
                <span>
                  {controller.auth.kind === "authenticated"
                    ? `Welcome, ${controller.auth.displayName}`
                    : "Guest viewing"}
                </span>
                <h1>Live now</h1>
                <p>{controller.busy ? "Refreshing Twitch…" : "Pick a signal and settle in."}</p>
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
              emptyMessage="No live channels are available right now."
              onSelect={controller.openStream}
              streams={controller.live}
              title={controller.auth.kind === "authenticated" ? "Recommended live" : "Quick watch"}
            />
            <CategoryShelf
              categories={controller.categories}
              onSelect={(category) => {
                controller.navigate("search")
                void controller.search(category.name)
              }}
            />
          </main>
        ) : null}
        {controller.screen.route === "following" ? (
          <main className="browse-view" id="main-content" tabIndex={-1}>
            <header className="page-heading">
              <span>Your channels</span>
              <h1>Following</h1>
              <p>Live channels from the Twitch account connected to this device.</p>
            </header>
            <StreamShelf
              emptyActionFocusId="following-connect"
              emptyActionLabel="Connect Twitch"
              emptyMessage="Connect Twitch or follow channels to populate this shelf."
              onEmptyAction={() => controller.navigate("settings")}
              onSelect={controller.openStream}
              streams={controller.followed}
              title="Live from your follows"
            />
          </main>
        ) : null}
        {controller.screen.route === "search" ? (
          <SearchView
            busy={controller.busy}
            onOpen={controller.openChannel}
            onSearch={(query) => void controller.search(query)}
            results={controller.searchResults}
          />
        ) : null}
        {controller.screen.route === "settings" ? (
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
