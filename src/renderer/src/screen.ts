import type { RouteName } from "./components/Navigation"
import type { PlayerSource } from "./components/PlayerView"

export type Screen =
  | { readonly kind: "browse"; readonly route: RouteName }
  | { readonly kind: "player"; readonly source: PlayerSource }
  | { readonly kind: "videos" }

export const shouldNavigateHomeOnBack = (screen: Screen): boolean =>
  screen.kind !== "browse" || screen.route !== "home"

export const screenEntryFocusId = (screen: Screen): string => {
  switch (screen.kind) {
    case "browse":
      return screen.route === "search" ? "search-input" : `nav-${screen.route}`
    case "player":
      return "player-back"
    case "videos":
      return "videos-back"
  }
}
