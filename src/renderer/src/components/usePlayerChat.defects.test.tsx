// @vitest-environment jsdom

import { act, useRef } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { VacuumStreamApi } from "../../../shared/contracts"
import type { PlayerSource } from "./PlayerView"
import { usePlayerChat } from "./usePlayerChat"

const source: PlayerSource = {
  channel: "twitch",
  kind: "live",
  title: "Live",
  userId: "1",
}
const sessionId = "11111111-1111-4111-8111-111111111111"

type ChatBridge = VacuumStreamApi["chatInput"] & {
  readonly begin: ReturnType<typeof vi.fn<VacuumStreamApi["chatInput"]["begin"]>>
  readonly end: ReturnType<typeof vi.fn<VacuumStreamApi["chatInput"]["end"]>>
  readonly onEscape: ReturnType<typeof vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>>
  readonly press: ReturnType<typeof vi.fn<VacuumStreamApi["chatInput"]["press"]>>
}

const installChatBridge = (): ChatBridge => {
  const chatInput = {
    begin: vi.fn<VacuumStreamApi["chatInput"]["begin"]>().mockResolvedValue(undefined),
    end: vi.fn<VacuumStreamApi["chatInput"]["end"]>().mockResolvedValue(undefined),
    onEscape: vi.fn<VacuumStreamApi["chatInput"]["onEscape"]>().mockReturnValue(() => undefined),
    press: vi.fn<VacuumStreamApi["chatInput"]["press"]>().mockResolvedValue(undefined),
  } satisfies VacuumStreamApi["chatInput"]
  vi.stubGlobal("crypto", { randomUUID: () => sessionId })
  vi.stubGlobal("vacuumStream", { chatInput })
  return chatInput
}

const Surface = () => {
  const backButtonRef = useRef<HTMLButtonElement>(null)
  const { chatButton, chatEnterButton, chatHint, chatPane, chatReloadButton } = usePlayerChat(
    source,
    backButtonRef,
  )
  return (
    <>
      <button ref={backButtonRef} data-focus-id="player-back" type="button">
        Back
      </button>
      {chatButton}
      {chatEnterButton}
      {chatReloadButton}
      {chatHint}
      {chatPane}
    </>
  )
}

let bridge: ChatBridge
let container: HTMLDivElement
let root: Root

const button = (id: string): HTMLButtonElement => {
  const element = container.querySelector<HTMLButtonElement>(`[data-focus-id="${id}"]`)
  if (element === null) throw new Error(`Missing button: ${id}`)
  return element
}

const chatFrame = (): HTMLIFrameElement => {
  const element = container.querySelector<HTMLIFrameElement>(".player-chat iframe")
  if (element === null) throw new Error("Missing chat frame")
  return element
}

const keyDown = async (key: string): Promise<void> => {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }))
  })
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  bridge = installChatBridge()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const enterChat = async (): Promise<void> => {
  await act(async () => root.render(<Surface />))
  await act(async () => button("player-chat").click())
  await act(async () => button("player-chat-enter").click())
}

describe("usePlayerChat defect regressions", () => {
  it.fails("D-cycle-07-1 translates physical and mapped arrows into bounded chat navigation while preserving Enter and Escape", async () => {
    await enterChat()
    const frame = chatFrame()
    const session = bridge.begin.mock.calls[0]?.[0]
    if (session === undefined) throw new Error("Chat entry did not start a session")
    expect(document.activeElement).toBe(frame)

    for (const key of ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"]) {
      await keyDown(key)
    }
    expect.soft(bridge.press.mock.calls).toEqual([
      [session, "next"],
      [session, "next"],
      [session, "previous"],
      [session, "previous"],
    ])
    expect.soft(frame.tabIndex).toBe(0)
    expect.soft(document.activeElement).toBe(frame)

    await keyDown("Enter")
    expect(bridge.press).toHaveBeenCalledTimes(4)
    expect(frame.tabIndex).toBe(0)
    expect(document.activeElement).toBe(frame)

    await keyDown("Escape")
    expect(frame.tabIndex).toBe(-1)
    expect(document.activeElement).toBe(button("player-chat"))
    expect(bridge.end).toHaveBeenCalledExactlyOnceWith(session)
  })

  it.fails("D-cycle-08-1 retains chat interaction through the iframe's initial load and exits on a subsequent load", async () => {
    await enterChat()
    const frame = chatFrame()
    const session = bridge.begin.mock.calls[0]?.[0]
    if (session === undefined) throw new Error("Chat entry did not start a session")
    expect(frame.tabIndex).toBe(0)

    await act(async () => frame.dispatchEvent(new Event("load")))
    expect.soft(frame.tabIndex).toBe(0)
    expect.soft(button("player-chat-enter").getAttribute("aria-pressed")).toBe("true")
    expect.soft(document.activeElement).toBe(frame)
    expect.soft(bridge.end).not.toHaveBeenCalled()

    await act(async () => frame.dispatchEvent(new Event("load")))
    expect(frame.tabIndex).toBe(-1)
    expect(button("player-chat-enter").getAttribute("aria-pressed")).toBe("false")
    expect(document.activeElement).toBe(button("player-chat"))
    expect(bridge.end).toHaveBeenCalledExactlyOnceWith(session)
  })
})
