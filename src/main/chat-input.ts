import type { BrowserWindow, Event, Input } from "electron"
import { CHANNELS } from "../shared/channels"

export const createChatInput = (window: BrowserWindow) => {
  const contents = window.webContents
  let session: string | undefined
  let drainingEscape = false

  const removeDrain = (): void => {
    drainingEscape = false
    contents.removeListener("before-input-event", drainEscape)
  }
  // The mode listener is removed on exit. Only the remainder of the consumed press survives.
  const drainEscape = (event: Event, input: Input): void => {
    if (input.key !== "Escape") return
    if (input.type === "keyDown" && !input.isAutoRepeat) {
      removeDrain()
      return
    }
    event.preventDefault()
    if (input.type === "keyUp") removeDrain()
  }
  const end = (id: string): void => {
    if (session !== id) return
    session = undefined
    contents.removeListener("before-input-event", interceptEscape)
  }
  const interceptEscape = (event: Event, input: Input): void => {
    if (session === undefined || input.key !== "Escape" || event.defaultPrevented) return
    event.preventDefault()
    if (input.type !== "keyDown") return
    const id = session
    end(id)
    if (!drainingEscape) {
      drainingEscape = true
      contents.on("before-input-event", drainEscape)
    }
    contents.send(CHANNELS.chatInputEscape, id)
  }
  const cancel = (): void => {
    if (session !== undefined) end(session)
    removeDrain()
  }
  const blur = (): void => {
    const id = session
    cancel()
    // BrowserWindow blur is authoritative; DOM blur also fires when an iframe gains focus.
    if (id !== undefined) contents.send(CHANNELS.chatInputEscape, id)
  }
  const begin = (id: string): void => {
    if (!window.isFocused()) throw new Error("Chat input requires a focused window")
    if (session !== undefined) end(session)
    session = id
    contents.on("before-input-event", interceptEscape)
  }

  return { begin, blur, cancel, end }
}

export type ChatInput = ReturnType<typeof createChatInput>
