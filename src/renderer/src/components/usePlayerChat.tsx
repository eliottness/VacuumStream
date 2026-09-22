import { type RefObject, useCallback, useRef, useState } from "react"
import { markControllerFocus } from "../focus-navigation"
import type { PlayerSource } from "./PlayerView"

const focusControl = (button: HTMLButtonElement | null): void => {
  if (button === null) return
  markControllerFocus(button)
  button.focus()
}

export const usePlayerChat = (
  source: PlayerSource,
  backButtonRef: RefObject<HTMLButtonElement | null>,
) => {
  const [chat, setChat] = useState({ nonce: 0, source, visible: false })
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  // Reset before committing children, so even a returning source cannot revive its old pane.
  if (chat.source !== source) setChat({ nonce: 0, source, visible: false })
  const visible = chat.source === source && chat.visible && source.kind === "live"

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
  const attachReload = useCallback(
    (button: HTMLButtonElement | null) => () => {
      if (button !== null && document.activeElement === button) {
        focusControl(buttonRef.current ?? backButtonRef.current)
      }
    },
    [backButtonRef],
  )
  const toggleChat = (): void => {
    setChat({ nonce: 0, source, visible: !visible })
    focusControl(buttonRef.current)
  }
  const reloadChat = (): void => setChat((current) => ({ ...current, nonce: current.nonce + 1 }))

  return {
    chatButton:
      source.kind === "live" ? (
        <button
          aria-controls={visible ? "player-chat-pane" : undefined}
          aria-expanded={visible}
          data-focus-down={visible ? "player-chat-reload" : "player-chat"}
          data-focus-id="player-chat"
          data-focus-left="player-vods"
          data-focus-right="player-fullscreen"
          data-focus-up="player-back"
          data-focusable="true"
          onClick={toggleChat}
          ref={attachButton}
          type="button"
        >
          {visible ? "Hide chat" : "Show chat"}
        </button>
      ) : null,
    chatPane:
      visible && source.kind === "live" ? (
        <aside aria-label="Live chat" className="player-chat" id="player-chat-pane">
          <div className="player-chat__frame">
            <iframe
              key={chat.nonce}
              src={`https://www.twitch.tv/embed/${encodeURIComponent(source.channel)}/chat?parent=localhost`}
              tabIndex={-1}
              title={`Live chat for ${source.channel}`}
            />
          </div>
        </aside>
      ) : null,
    chatReloadButton: visible ? (
      <button
        data-focus-down="player-chat-reload"
        data-focus-id="player-chat-reload"
        data-focus-left="player-chat"
        data-focus-right="player-fullscreen"
        data-focus-up="player-chat"
        data-focusable="true"
        onClick={reloadChat}
        ref={attachReload}
        type="button"
      >
        Reload chat
      </button>
    ) : null,
  }
}
