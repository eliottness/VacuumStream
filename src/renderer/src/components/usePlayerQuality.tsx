import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react"
import { markControllerFocus } from "../focus-navigation"
import {
  normalizeTwitchQualities,
  type TwitchPlayerInstance,
  type TwitchQuality,
} from "../twitch-player"

const optionFocusId = (id: string): string => `player-quality-option-${id}`
const focusControl = (element: HTMLButtonElement | null): void => {
  if (element === null) return
  markControllerFocus(element)
  element.focus()
}

export const usePlayerQuality = (
  playerRef: RefObject<TwitchPlayerInstance | undefined>,
  ready: boolean,
) => {
  const [open, setOpen] = useState(false)
  const [qualities, setQualities] = useState<readonly TwitchQuality[]>([])
  const [requested, setRequested] = useState<TwitchQuality | undefined>(undefined)
  const [reported, setReported] = useState<string | undefined>(undefined)
  const [error, setError] = useState("")
  const buttonRef = useRef<HTMLButtonElement>(null)
  const chooserRef = useRef<HTMLElement>(null)
  const focusOnOpen = useRef(false)

  const refreshQualities = useCallback((player: TwitchPlayerInstance): readonly TwitchQuality[] => {
    try {
      const next = normalizeTwitchQualities(player.getQualities())
      const current = player.getQuality()
      setQualities(next)
      setReported(current)
      setError("")
      return next
    } catch {
      setQualities([])
      setReported(undefined)
      setError("Twitch could not report playback qualities.")
      return []
    }
  }, [])

  const resetQualities = useCallback((close = true): void => {
    setQualities([])
    setRequested(undefined)
    setReported(undefined)
    setError("")
    if (close) {
      if (chooserRef.current?.contains(document.activeElement)) focusControl(buttonRef.current)
      focusOnOpen.current = false
      setOpen(false)
    }
  }, [])

  useLayoutEffect(() => {
    // Recover shell focus when a refreshed list removes the focused option.
    if (open && (focusOnOpen.current || document.activeElement === document.body)) {
      focusControl(chooserRef.current?.querySelector<HTMLButtonElement>("button") ?? null)
      focusOnOpen.current = false
    }
  })

  const openChooser = (): void => {
    if (ready && playerRef.current !== undefined) refreshQualities(playerRef.current)
    if (open) {
      focusControl(chooserRef.current?.querySelector<HTMLButtonElement>("button") ?? null)
    } else {
      focusOnOpen.current = true
      setOpen(true)
    }
  }
  const closeChooser = (): void => {
    setOpen(false)
    focusControl(buttonRef.current)
  }
  const selectQuality = (id: string): void => {
    const player = playerRef.current
    if (!ready || player === undefined) return
    const quality = refreshQualities(player).find((entry) => entry.id === id)
    if (quality === undefined) return
    try {
      player.setQuality(quality.id)
      // A request is not confirmation; Auto's reported quality is its effective resolution.
      setRequested(quality)
    } catch {
      setError("Twitch could not accept the quality request. Try again.")
    }
  }

  const firstId =
    qualities[0] === undefined ? "player-quality-close" : optionFocusId(qualities[0].id)
  const lastQuality = qualities.at(-1)

  return {
    qualityButton: (
      <button
        aria-controls={open ? "player-quality-chooser" : undefined}
        aria-expanded={open}
        data-focus-down={open ? firstId : "player-quality"}
        data-focus-id="player-quality"
        data-focus-left={ready ? "player-muted" : "player-back"}
        data-focus-right="player-captions"
        data-focus-up="player-back"
        data-focusable="true"
        data-player-quality={reported}
        data-requested-quality={requested?.id}
        onClick={openChooser}
        ref={buttonRef}
        type="button"
      >
        Quality
      </button>
    ),
    qualityChooser: open ? (
      <section
        aria-label="Playback quality"
        className="player-quality"
        id="player-quality-chooser"
        ref={chooserRef}
      >
        <p aria-live="polite" className="player-quality__status">
          {error !== ""
            ? error
            : qualities.length === 0
              ? "Twitch has not supplied quality options for this source."
              : requested === undefined
                ? "Choose a quality reported by Twitch."
                : `Requested: ${requested.label}. Twitch may take time to apply the change.`}
        </p>
        <div className="player-quality__options">
          {qualities.map((quality, index) => (
            <button
              aria-pressed={requested?.id === quality.id}
              data-focus-down="player-quality-close"
              data-focus-id={optionFocusId(quality.id)}
              data-focus-left={
                index === 0
                  ? "player-quality"
                  : optionFocusId(qualities[index - 1]?.id ?? quality.id)
              }
              data-focus-right={
                index === qualities.length - 1
                  ? "player-quality-close"
                  : optionFocusId(qualities[index + 1]?.id ?? quality.id)
              }
              data-focus-up="player-quality"
              data-focusable="true"
              key={quality.id}
              onClick={() => selectQuality(quality.id)}
              type="button"
            >
              {quality.label}
            </button>
          ))}
        </div>
        <button
          data-focus-down="player-quality-close"
          data-focus-id="player-quality-close"
          data-focus-left={
            lastQuality === undefined ? "player-quality" : optionFocusId(lastQuality.id)
          }
          data-focus-right="player-quality-close"
          data-focus-up="player-quality"
          data-focusable="true"
          onClick={closeChooser}
          type="button"
        >
          Close
        </button>
      </section>
    ) : null,
    refreshQualities,
    resetQualities,
  }
}
