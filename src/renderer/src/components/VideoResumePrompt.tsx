import { useEffect, useRef } from "react"
import { markControllerFocus } from "../focus-navigation"

type VideoResumePromptProps = {
  readonly error?: string | undefined
  readonly focusOnMount?: boolean
  readonly focusPrefix?: string
  readonly loading?: boolean
  readonly onBack: () => void
  readonly onResume?: (() => void) | undefined
  readonly onStartOver?: (() => void) | undefined
  readonly position?: number | undefined
  readonly title: string
}

const formatPosition = (position: number): string => {
  const seconds = Math.floor(position)
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
}

export const VideoResumePrompt = ({
  error,
  focusOnMount = true,
  focusPrefix = "video-resume",
  loading = false,
  onBack,
  onResume,
  onStartOver,
  position,
  title,
}: VideoResumePromptProps) => {
  const promptRef = useRef<HTMLElement>(null)
  const initialId = `${focusPrefix}-${loading ? "back" : position === undefined ? "start" : "resume"}`
  useEffect(() => {
    if (!focusOnMount) return
    const button = promptRef.current?.querySelector<HTMLButtonElement>(
      `[data-focus-id="${initialId}"]`,
    )
    if (button !== undefined && button !== null) {
      markControllerFocus(button)
      button.focus()
    }
  }, [focusOnMount, initialId])
  const actions = [
    ...(position === undefined || loading
      ? []
      : [
          {
            id: `${focusPrefix}-resume`,
            label: `Resume from ${formatPosition(position)}`,
            onClick: onResume,
          },
        ]),
    ...(loading
      ? []
      : [
          {
            id: `${focusPrefix}-start`,
            label: position === undefined ? "Play without resume" : "Start over",
            onClick: onStartOver,
          },
        ]),
    { id: `${focusPrefix}-back`, label: "Back", onClick: onBack },
  ]

  return (
    <section
      aria-busy={loading}
      aria-labelledby={`${focusPrefix}-title`}
      className="video-resume"
      ref={promptRef}
    >
      <span className="video-resume__eyebrow">Past broadcast</span>
      <h1 id={`${focusPrefix}-title`}>{title}</h1>
      {loading ? <p role="status">Checking local playback progress...</p> : null}
      {error === undefined ? null : (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <p>Playback positions stay on this installation and are shared across Twitch accounts.</p>
      <div className="video-resume__actions">
        {actions.map((action, index) => (
          <button
            className={index === 0 && !loading ? "primary-button" : undefined}
            data-focus-down={actions[index + 1]?.id ?? action.id}
            data-focus-id={action.id}
            data-focus-left={actions[index - 1]?.id ?? action.id}
            data-focus-right={actions[index + 1]?.id ?? action.id}
            data-focus-up={actions[index - 1]?.id ?? action.id}
            data-focusable="true"
            key={action.id}
            onClick={action.onClick}
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>
    </section>
  )
}
