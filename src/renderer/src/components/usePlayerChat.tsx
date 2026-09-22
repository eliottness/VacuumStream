import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react"
import {
  CHAT_GAMEPAD_EVENT,
  type ChatGamepadAction,
  markControllerFocus,
} from "../focus-navigation"
import type { PlayerSource } from "./PlayerView"

const focusControl = (button: HTMLButtonElement | null): void => {
  if (button === null) return
  markControllerFocus(button)
  button.focus()
}

type ChatSession = {
  readonly cleanup: () => void
  readonly frame: HTMLIFrameElement
  readonly id: string
}

export const usePlayerChat = (
  source: PlayerSource,
  backButtonRef: RefObject<HTMLButtonElement | null>,
) => {
  const [chat, setChat] = useState({ nonce: 0, source, visible: false })
  const [interacting, setInteracting] = useState(false)
  const [error, setError] = useState("")
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const sessionRef = useRef<ChatSession | undefined>(undefined)
  // Reset before committing children, so even a returning source cannot revive its old pane.
  if (chat.source !== source) {
    setChat({ nonce: 0, source, visible: false })
    setError("")
  }
  const visible = chat.source === source && chat.visible && source.kind === "live"

  const endInteraction = useCallback((): void => {
    const session = sessionRef.current
    if (session === undefined) return
    sessionRef.current = undefined
    session.cleanup()
    session.frame.tabIndex = -1
    setInteracting(false)
    focusControl(buttonRef.current ?? backButtonRef.current)
    void window.vacuumStream.chatInput.end(session.id).catch((cause: unknown) => {
      console.error("Could not end chat input", cause)
    })
  }, [backButtonRef])

  useLayoutEffect(() => endInteraction, [endInteraction])

  const attachButton = useCallback(
    (button: HTMLButtonElement | null) => {
      buttonRef.current = button
      return () => {
        if (button !== null && document.activeElement === button) {
          focusControl(backButtonRef.current)
        }
        buttonRef.current = null
      }
    },
    [backButtonRef],
  )
  const attachAction = useCallback(
    (button: HTMLButtonElement | null) => () => {
      if (button !== null && document.activeElement === button) {
        focusControl(buttonRef.current ?? backButtonRef.current)
      }
    },
    [backButtonRef],
  )
  const attachFrame = useCallback(
    (frame: HTMLIFrameElement | null) => {
      frameRef.current = frame
      return () => {
        endInteraction()
        frameRef.current = null
      }
    },
    [endInteraction],
  )
  const enterChat = (): void => {
    const frame = frameRef.current
    if (frame === null || sessionRef.current !== undefined) return
    const id = crypto.randomUUID()
    setError("")
    const transportFailed = (): void => {
      if (sessionRef.current?.id !== id) return
      endInteraction()
      setError(
        "Native chat input unavailable. Enter chat again to use a keyboard or Steam Input; Escape returns here.",
      )
    }
    const unsubscribe = window.vacuumStream.chatInput.onEscape((escapedSession, failure) => {
      if (sessionRef.current?.id !== escapedSession) return
      if (failure === "transport") transportFailed()
      else endInteraction()
    })
    let ready = false
    const onGamepad = (event: Event): void => {
      event.preventDefault()
      event.stopImmediatePropagation()
      const action = (event as CustomEvent<ChatGamepadAction>).detail
      if (action === "exit") endInteraction()
      else if (ready && action !== "consume") {
        void window.vacuumStream.chatInput.press(id, action).catch(transportFailed)
      }
    }
    // Keyboard events in Twitch stay native. Shell shortcuts cannot escape this mode.
    // Capture also makes B/Escape an exit rather than the app's Home shortcut.
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.key === "Escape") endInteraction()
    }
    document.addEventListener("keydown", onKeyDown, true)
    document.addEventListener(CHAT_GAMEPAD_EVENT, onGamepad, true)
    frame.addEventListener("load", endInteraction)
    sessionRef.current = {
      cleanup: () => {
        unsubscribe()
        document.removeEventListener("keydown", onKeyDown, true)
        document.removeEventListener(CHAT_GAMEPAD_EVENT, onGamepad, true)
        frame.removeEventListener("load", endInteraction)
      },
      frame,
      id,
    }
    // Arm Escape before handing focus across the origin boundary. Never replay the entry key.
    void window.vacuumStream.chatInput.begin(id).then(
      () => {
        if (sessionRef.current?.id !== id) return
        ready = true
        setInteracting(true)
        frame.tabIndex = 0
        document
          .querySelector('[data-controller-focused="true"]')
          ?.removeAttribute("data-controller-focused")
        frame.focus()
      },
      (cause: unknown) => {
        if (sessionRef.current?.id !== id) return
        endInteraction()
        setError(cause instanceof Error ? cause.message : "Could not enter Twitch chat.")
      },
    )
  }
  const toggleChat = (): void => {
    endInteraction()
    setError("")
    setChat({ nonce: 0, source, visible: !visible })
    focusControl(buttonRef.current)
  }
  const reloadChat = (): void => {
    endInteraction()
    setError("")
    setChat((current) => ({ ...current, nonce: current.nonce + 1 }))
  }

  return {
    chatButton:
      source.kind === "live" ? (
        <button
          aria-controls={visible ? "player-chat-pane" : undefined}
          aria-expanded={visible}
          data-focus-down={visible ? "player-chat-enter" : "player-chat"}
          data-focus-id="player-chat"
          data-focus-left="player-vods"
          data-focus-right={visible ? "player-chat-enter" : "player-fullscreen"}
          data-focus-up="player-back"
          data-focusable="true"
          onClick={toggleChat}
          ref={attachButton}
          type="button"
        >
          {visible ? "Hide chat" : "Show chat"}
        </button>
      ) : null,
    chatEnterButton: visible ? (
      <button
        aria-controls="player-chat-pane"
        aria-describedby={interacting ? "player-chat-hint" : undefined}
        aria-pressed={interacting}
        data-focus-down="player-chat-reload"
        data-focus-id="player-chat-enter"
        data-focus-left="player-chat"
        data-focus-right="player-chat-reload"
        data-focus-up="player-chat"
        data-focusable="true"
        onClick={enterChat}
        ref={attachAction}
        type="button"
      >
        Enter chat
      </button>
    ) : null,
    chatHint: interacting ? (
      <p className="player-chat-hint" id="player-chat-hint" role="status">
        Twitch's interface: D-pad / left stick Down or Right moves next, Up or Left moves previous;
        A activates, B returns to Hide chat. Keyboard or Steam Input: Tab / Shift+Tab to move, Enter
        to activate, Escape to return.
      </p>
    ) : error !== "" ? (
      <p className="player-chat-hint" role="alert">
        {error}
      </p>
    ) : null,
    chatPane:
      visible && source.kind === "live" ? (
        <aside aria-label="Live chat" className="player-chat" id="player-chat-pane">
          <div className="player-chat__frame">
            <iframe
              key={chat.nonce}
              ref={attachFrame}
              src={`https://www.twitch.tv/embed/${encodeURIComponent(source.channel)}/chat?parent=localhost`}
              tabIndex={interacting ? 0 : -1}
              title={`Live chat for ${source.channel}`}
            />
          </div>
        </aside>
      ) : null,
    chatReloadButton: visible ? (
      <button
        data-focus-down="player-chat-reload"
        data-focus-id="player-chat-reload"
        data-focus-left="player-chat-enter"
        data-focus-right="player-fullscreen"
        data-focus-up="player-chat"
        data-focusable="true"
        onClick={reloadChat}
        ref={attachAction}
        type="button"
      >
        Reload chat
      </button>
    ) : null,
    fullscreenLeft: visible
      ? "player-chat-reload"
      : source.kind === "live"
        ? "player-chat"
        : "player-vods",
  }
}
