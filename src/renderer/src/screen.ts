import type { RouteName } from "./components/Navigation"
import type { PlayerSource } from "./components/PlayerView"

export type Screen =
  | {
      readonly followingMode?: "all"
      readonly kind: "browse"
      readonly route: RouteName
    }
  | { readonly id: string; readonly kind: "category"; readonly name: string }
  | { readonly kind: "player"; readonly source: PlayerSource }
  | { readonly kind: "videos"; readonly userId: string }

export const shouldNavigateHomeOnBack = (screen: Screen): boolean =>
  screen.kind !== "browse" || screen.route !== "home"

export const screenEntryFocusId = (screen: Screen): string => {
  switch (screen.kind) {
    case "browse":
      if (screen.followingMode === "all") return "following-all"
      return screen.route === "search" ? "search-input" : `nav-${screen.route}`
    case "category":
      return "category-back"
    case "player":
      return "player-back"
    case "videos":
      return "videos-back"
  }
}
