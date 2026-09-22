import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react"
import { markControllerFocus } from "../focus-navigation"
import type { TwitchPlayerInstance } from "../twitch-player"

const focusControl = (button: HTMLButtonElement | null): void => {
  if (button === null) return
  markControllerFocus(button)
  button.focus()
}

export const usePlayerCaptions = (
  playerRef: RefObject<TwitchPlayerInstance | undefined>,
  ready: boolean,
) => {
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState<"show" | "hide" | undefined>(undefined)
  const [error, setError] = useState("")
  const buttonRef = useRef<HTMLButtonElement>(null)
  const chooserRef = useRef<HTMLElement>(null)
  const focusOnOpen = useRef(false)

  const resetCaptions = useCallback((): void => {
    if (chooserRef.current?.contains(document.activeElement)) focusControl(buttonRef.current)
    focusOnOpen.current = false
    setOpen(false)
    setRequested(undefined)
    setError("")
  }, [])

  useLayoutEffect(() => {
    const focused = document.activeElement
    // Offline can disable a focused command. Keep Close reachable without entering the embed.
    if (
      open &&
      (focusOnOpen.current ||
        focused === document.body ||
        (focused instanceof HTMLButtonElement &&
          focused.disabled &&
          chooserRef.current?.contains(focused)))
    ) {
      focusControl(chooserRef.current?.querySelector<HTMLButtonElement>("button:enabled") ?? null)
      focusOnOpen.current = false
    }
  })

  const openChooser = (): void => {
    if (open) {
      focusControl(chooserRef.current?.querySelector<HTMLButtonElement>("button:enabled") ?? null)
    } else {
      focusOnOpen.current = true
      setOpen(true)
    }
  }
  const closeChooser = (): void => {
    setOpen(false)
    focusControl(buttonRef.current)
  }
  const dismissChooser = useCallback((): boolean => {
    if (!open) return false
    setOpen(false)
    focusControl(buttonRef.current)
    return true
  }, [open])
  const requestCaptions = (setting: "show" | "hide"): void => {
    const player = playerRef.current
    if (!ready || player === undefined) return
    try {
      if (setting === "show") player.enableCaptions()
      else player.disableCaptions()
      // The API has no availability getter or rendering confirmation.
      setRequested(setting)
      setError("")
    } catch {
      setError("Twitch could not accept the caption request. Try again.")
    }
  }

  return {
    captionsButton: (
      <button
        aria-controls={open ? "player-captions-chooser" : undefined}
        aria-expanded={open}
        data-focus-down={
          open ? (ready ? "player-captions-show" : "player-captions-close") : "player-captions"
        }
        data-focus-id="player-captions"
        data-focus-left="player-quality"
        data-focus-right="player-vods"
        data-focus-up="player-back"
        data-focusable="true"
        data-requested-captions={requested}
        onClick={openChooser}
        ref={buttonRef}
        type="button"
      >
        Captions
      </button>
    ),
    captionsChooser: open ? (
      <section
        aria-label="Captions"
        className="player-captions"
        id="player-captions-chooser"
        ref={chooserRef}
      >
        <p className="player-captions__status" role={error !== "" ? "alert" : "status"}>
          {error !== ""
            ? error
            : requested === undefined
              ? "No caption setting requested; Twitch's default is unchanged."
              : `Requested: ${requested === "show" ? "Show" : "Hide"} captions.`}{" "}
          Captions come from the broadcaster. Twitch renders and styles them; availability is not
          reported by this control.
        </p>
        <div className="player-captions__options">
          <button
            aria-pressed={requested === "show"}
            data-focus-down="player-captions-close"
            data-focus-id="player-captions-show"
            data-focus-left="player-captions-close"
            data-focus-right="player-captions-hide"
            data-focus-up="player-captions"
            data-focusable="true"
            disabled={!ready}
            onClick={() => requestCaptions("show")}
            type="button"
          >
            Show
          </button>
          <button
            aria-pressed={requested === "hide"}
            data-focus-down="player-captions-close"
            data-focus-id="player-captions-hide"
            data-focus-left="player-captions-show"
            data-focus-right="player-captions-close"
            data-focus-up="player-captions"
            data-focusable="true"
            disabled={!ready}
            onClick={() => requestCaptions("hide")}
            type="button"
          >
            Hide
          </button>
        </div>
        <button
          data-focus-down="player-captions"
          data-focus-id="player-captions-close"
          data-focus-left={ready ? "player-captions-hide" : "player-captions"}
          data-focus-right={ready ? "player-captions-show" : "player-captions-close"}
          data-focus-up="player-captions"
          data-focusable="true"
          onClick={closeChooser}
          type="button"
        >
          Close
        </button>
      </section>
    ) : null,
    dismissCaptionsChooser: dismissChooser,
    resetCaptions,
  }
}
