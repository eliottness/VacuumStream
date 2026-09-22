import type {
  BrowserWindow,
  Event,
  Input,
  WebContentsDidStartNavigationEventParams,
  WebFrameMain,
} from "electron"
import { CHANNELS } from "../shared/channels"
import type { ChatInputAction } from "../shared/contracts"

type ChatSession = {
  readonly frame: WebFrameMain | undefined
  readonly id: string
  readonly url: string | undefined
}

const isChatUrl = (url: string): boolean =>
  /^https:\/\/www\.twitch\.tv\/embed\/[a-zA-Z0-9_]{1,25}\/chat\?parent=localhost$/.test(url)

export const createChatInput = (window: BrowserWindow) => {
  const contents = window.webContents
  let session: ChatSession | undefined
  let drainingEscape = false
  let ownsDebugger = false
  let queue = Promise.resolve()

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
    if (session?.id !== id) return
    session = undefined
    contents.removeListener("before-input-event", interceptEscape)
    contents.removeListener("did-start-navigation", navigating)
    contents.removeListener("render-process-gone", cancel)
    if (ownsDebugger) {
      ownsDebugger = false
      contents.debugger.removeListener("detach", debuggerLost)
      contents.debugger.detach()
    }
  }
  const notify = (id: string, failure?: "transport"): void => {
    if (contents.isDestroyed()) return
    if (failure === undefined) contents.send(CHANNELS.chatInputEscape, id)
    else contents.send(CHANNELS.chatInputEscape, id, failure)
  }
  const fail = (current: ChatSession): void => {
    if (session !== current) return
    end(current.id)
    notify(current.id, "transport")
  }
  const debuggerLost = (): void => {
    ownsDebugger = false
    contents.debugger.removeListener("detach", debuggerLost)
    if (session !== undefined) fail(session)
  }
  const interceptEscape = (event: Event, input: Input): void => {
    if (session === undefined || input.key !== "Escape" || event.defaultPrevented) return
    event.preventDefault()
    if (input.type !== "keyDown") return
    const { id } = session
    end(id)
    if (!drainingEscape) {
      drainingEscape = true
      contents.on("before-input-event", drainEscape)
    }
    notify(id)
  }
  const cancel = (): void => {
    const id = session?.id
    if (id !== undefined) end(id)
    removeDrain()
    if (id !== undefined) notify(id)
  }
  const navigating = (details: Event<WebContentsDidStartNavigationEventParams>): void => {
    if (details.isMainFrame || details.frame === session?.frame) cancel()
  }
  const begin = (id: string): void => {
    if (!window.isFocused()) throw new Error("Chat input requires a focused window")
    if (session !== undefined) end(session.id)
    // Capture the app's current direct chat child, not a renderer-supplied target or URL.
    const frame = contents.mainFrame.frames.find((candidate) => isChatUrl(candidate.url))
    session = { frame, id, url: frame?.url }
    contents.on("before-input-event", interceptEscape)
    contents.on("did-start-navigation", navigating)
    contents.on("render-process-gone", cancel)
  }
  const validateFocus = (current: ChatSession): void => {
    const frame = current.frame
    if (
      !window.isFocused() ||
      frame === undefined ||
      frame.isDestroyed() ||
      frame.detached ||
      contents.focusedFrame !== frame ||
      frame.parent !== contents.mainFrame ||
      frame.top !== contents.mainFrame ||
      !contents.mainFrame.frames.includes(frame) ||
      frame.url !== current.url ||
      !isChatUrl(frame.url)
    ) {
      throw new Error("Native chat input requires the current focused Twitch chat frame")
    }
  }
  const press = async (id: string, action: ChatInputAction): Promise<void> => {
    const current = session
    if (current === undefined || current.id !== id) throw new Error("Chat input session expired")
    try {
      validateFocus(current)
    } catch (cause) {
      fail(current)
      throw cause
    }
    const dispatch = queue.then(async () => {
      if (session !== current) return
      try {
        // Revalidate queued work immediately before dispatch; never revive obsolete sessions.
        validateFocus(current)
        if (!ownsDebugger) {
          if (contents.debugger.isAttached()) throw new Error("Chat input debugger is busy")
          contents.debugger.attach("1.3")
          ownsDebugger = true
          contents.debugger.on("detach", debuggerLost)
        }
        const activate = action === "activate"
        const key = {
          code: activate ? "Enter" : "Tab",
          key: activate ? "Enter" : "Tab",
          modifiers: action === "previous" ? 8 : 0,
          windowsVirtualKeyCode: activate ? 13 : 9,
        }
        // Submit the balanced pair together, in protocol order, before yielding. Exit cannot
        // leave a keyDown awaiting a later keyUp that would target newly restored shell focus.
        const down = contents.debugger.sendCommand("Input.dispatchKeyEvent", {
          ...key,
          ...(activate ? { text: "\r" } : {}),
          type: "keyDown",
        })
        const up = contents.debugger.sendCommand("Input.dispatchKeyEvent", {
          ...key,
          type: "keyUp",
        })
        await Promise.all([down, up])
      } catch (cause) {
        fail(current)
        throw cause
      }
    })
    // The caller receives failures; only the internal serialization tail recovers.
    queue = dispatch.then(
      () => undefined,
      () => undefined,
    )
    await dispatch
  }

  // BrowserWindow blur is authoritative; DOM blur also fires when an iframe gains focus.
  return { begin, blur: cancel, cancel, end, press }
}

export type ChatInput = ReturnType<typeof createChatInput>
