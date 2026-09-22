import { describe, expect, it } from "vitest"
import type { Favourite, PlaybackBookmark } from "../../shared/contracts"
import { homeFocus } from "./home-focus"

const recordings: readonly PlaybackBookmark[] = Object.freeze([
  Object.freeze({ duration: 3600, position: 60, updatedAt: 2, videoId: "first" }),
  Object.freeze({ duration: 3600, position: 120, updatedAt: 1, videoId: "last" }),
])
const favourites: readonly Favourite[] = Object.freeze([
  Object.freeze({ login: "alpha" }),
  Object.freeze({ login: "zulu" }),
])
const states = [
  { entry: undefined, name: "empty ready", populated: false, status: "ready", up: undefined },
  { entry: undefined, name: "empty loading", populated: false, status: "loading", up: undefined },
  { entry: "retry", name: "empty error", populated: false, status: "error", up: "retry" },
  { entry: "first", name: "populated ready", populated: true, status: "ready", up: "last" },
  { entry: "first", name: "populated loading", populated: true, status: "loading", up: "last" },
  { entry: "first", name: "populated error", populated: true, status: "error", up: "retry" },
] as const
const modes = [
  {
    fallback: "home-sign-in",
    live: "stream-preview-twitch",
    mode: "guest",
    upper: "home-sign-in",
  },
  { fallback: "home-refresh", live: "home-refresh", mode: "authenticated", upper: "nav-home" },
] as const
const cases = modes.flatMap((mode) =>
  states.flatMap((continued) => states.map((saved) => ({ ...mode, continued, saved }))),
)

describe("Home focus model", () => {
  it.each(cases)(
    "$mode / Continue Watching $continued.name / favourites $saved.name",
    ({ continued, fallback, live, mode, saved, upper }) => {
      const continueState = Object.freeze({
        items: continued.populated ? recordings : Object.freeze([]),
        status: continued.status,
      })
      const favouriteState = Object.freeze({
        items: saved.populated ? favourites : Object.freeze([]),
        status: saved.status,
      })
      const continueEntries = { first: "continue-first-open", retry: "continue-retry" }
      const continueReturns = { last: "continue-last-forget", retry: "continue-retry" }
      const favouriteEntries = { first: "favourite-alpha-open", retry: "favourite-retry" }
      const favouriteReturns = { last: "favourite-zulu-remove", retry: "favourite-retry" }
      const continueEntry =
        continued.entry === undefined ? undefined : continueEntries[continued.entry]
      const continueUp = continued.up === undefined ? undefined : continueReturns[continued.up]
      const favouriteEntry = saved.entry === undefined ? undefined : favouriteEntries[saved.entry]
      const favouriteUp = saved.up === undefined ? undefined : favouriteReturns[saved.up]

      const model = homeFocus(mode, continueState, favouriteState)

      expect(model).toEqual({
        continueWatching: {
          fallbackFocusId: favouriteEntry ?? fallback,
          lowerFocusId: favouriteEntry ?? live,
          upperFocusId: "nav-home",
        },
        entryFocusId: continueEntry ?? favouriteEntry ?? fallback,
        favourites: {
          fallbackFocusId: continueEntry ?? fallback,
          lowerFocusId: live,
          upperFocusId: continueUp ?? "nav-home",
        },
        liveEntryUpperFocusId: favouriteUp ?? continueUp ?? upper,
        signInDownFocusId: continueEntry ?? favouriteEntry ?? live,
      })
      const renderedIds = new Set([
        "nav-home",
        fallback,
        live,
        ...(continued.populated
          ? [
              "continue-first-open",
              "continue-last-open",
              "continue-first-forget",
              "continue-last-forget",
            ]
          : []),
        ...(continued.status === "error" ? ["continue-retry"] : []),
        ...(saved.populated
          ? [
              "favourite-alpha-open",
              "favourite-zulu-open",
              "favourite-alpha-remove",
              "favourite-zulu-remove",
            ]
          : []),
        ...(saved.status === "error" ? ["favourite-retry"] : []),
      ])
      const targets = [
        ...Object.values(model.continueWatching),
        ...Object.values(model.favourites),
        model.entryFocusId,
        model.liveEntryUpperFocusId,
        model.signInDownFocusId,
      ]
      for (const target of targets) {
        expect(target.length).toBeGreaterThan(0)
        expect(renderedIds.has(target), target).toBe(true)
      }
      expect(homeFocus(mode, continueState, favouriteState)).toEqual(model)
    },
  )
})
