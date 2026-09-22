import type { ContinueWatchingState } from "./useContinueWatching"
import type { FavouritesState } from "./useFavourites"

// Home owns inter-shelf links; shelves own their internal graph and browser-focus recovery.
export const homeFocus = (
  mode: "authenticated" | "guest",
  continueWatching: Pick<ContinueWatchingState, "items" | "status">,
  favourites: Pick<FavouritesState, "items" | "status">,
) => {
  const firstContinue = continueWatching.items[0]
  const lastContinue = continueWatching.items.at(-1)
  const continueEntry =
    firstContinue === undefined
      ? continueWatching.status === "error"
        ? "continue-retry"
        : undefined
      : `continue-${firstContinue.videoId}-open`
  const continueReturn =
    continueWatching.status === "error"
      ? "continue-retry"
      : lastContinue === undefined
        ? undefined
        : `continue-${lastContinue.videoId}-forget`
  const firstFavourite = favourites.items[0]
  const lastFavourite = favourites.items.at(-1)
  const favouriteEntry =
    firstFavourite === undefined
      ? favourites.status === "error"
        ? "favourite-retry"
        : undefined
      : `favourite-${firstFavourite.login}-open`
  const favouriteReturn =
    favourites.status === "error"
      ? "favourite-retry"
      : lastFavourite === undefined
        ? undefined
        : `favourite-${lastFavourite.login}-remove`
  const liveEntry = mode === "authenticated" ? "home-refresh" : "stream-preview-twitch"
  const fallback = mode === "authenticated" ? "home-refresh" : "home-sign-in"

  return {
    continueWatching: {
      fallbackFocusId: favouriteEntry ?? fallback,
      lowerFocusId: favouriteEntry ?? liveEntry,
      upperFocusId: "nav-home",
    },
    entryFocusId: continueEntry ?? favouriteEntry ?? fallback,
    favourites: {
      fallbackFocusId: continueEntry ?? fallback,
      lowerFocusId: liveEntry,
      upperFocusId: continueReturn ?? "nav-home",
    },
    // Down enters the first item; Up intentionally returns to the last action (or Retry).
    liveEntryUpperFocusId:
      favouriteReturn ?? continueReturn ?? (mode === "authenticated" ? "nav-home" : "home-sign-in"),
    signInDownFocusId: continueEntry ?? favouriteEntry ?? liveEntry,
  }
}
