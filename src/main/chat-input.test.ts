import { EventEmitter } from "node:events"
import type { BrowserWindow, Input } from "electron"
import { describe, expect, it, vi } from "vitest"
import { CHANNELS } from "../shared/channels"
import { createChatInput } from "./chat-input"

const setup = () => {
  const send = vi.fn()
  const contents = Object.assign(new EventEmitter(), { send })
  const isFocused = vi.fn(() => true)
  const controller = createChatInput({
    isFocused,
    webContents: contents,
  } as unknown as BrowserWindow)
  const input = (key: string, type: Input["type"] = "keyDown", isAutoRepeat = false) => {
    const event = {
      defaultPrevented: false,
      preventDefault: () => {
        event.defaultPrevented = true
      },
    }
    contents.emit("before-input-event", event, { isAutoRepeat, key, type })
    return event.defaultPrevented
  }
  return { contents, controller, input, isFocused, send }
}

const first = "81c9fdf9-2f3c-4e75-a10d-8694e97843da"
const second = "c7e5c334-ab25-401a-a21c-8fc9e9c6fce2"

describe("chat Escape interception", () => {
  it("passes inactive Escape and non-Escape input through, but prevents active Escape before notifying", () => {
    const { contents, controller, input, send } = setup()
    expect(input("Escape")).toBe(false)
    controller.begin(first)
    expect(contents.listenerCount("before-input-event")).toBe(1)
    for (const key of ["Tab", "Enter", "ArrowDown", "a"]) expect(input(key)).toBe(false)
    send.mockImplementation(() => {
      // The interaction interceptor is already detached when the renderer receives the exit.
      expect(contents.listenerCount("before-input-event")).toBe(1)
    })
    expect(input("Escape")).toBe(true)
    expect(send).toHaveBeenCalledExactlyOnceWith(CHANNELS.chatInputEscape, first)
  })

  it("consumes held Escape repeats and the matching keyUp after end, then passes a distinct press", () => {
    const { contents, controller, input, send } = setup()
    controller.begin(first)
    const interceptor = contents.listeners("before-input-event")[0]
    expect(input("Escape")).toBe(true)
    expect(contents.listeners("before-input-event")).not.toContain(interceptor)
    controller.end(first)
    expect(input("Escape", "keyDown", true)).toBe(true)
    expect(input("Escape", "keyDown", true)).toBe(true)
    expect(input("Tab")).toBe(false)
    expect(input("Escape", "keyUp")).toBe(true)
    expect(contents.listenerCount("before-input-event")).toBe(0)
    expect(input("Escape")).toBe(false)
    expect(input("Escape", "keyUp")).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("does not eat a new distinct Escape if the previous release was lost", () => {
    const { contents, controller, input } = setup()
    controller.begin(first)
    expect(input("Escape")).toBe(true)
    expect(input("Escape")).toBe(false)
    expect(contents.listenerCount("before-input-event")).toBe(0)
  })

  it("removes the listener on end and ignores a stale end after replacement", () => {
    const { contents, controller, input, send } = setup()
    controller.begin(first)
    controller.begin(second)
    controller.end(first)
    expect(contents.listenerCount("before-input-event")).toBe(1)
    expect(input("Escape")).toBe(true)
    expect(send).toHaveBeenCalledExactlyOnceWith(CHANNELS.chatInputEscape, second)
    input("Escape", "keyUp")
    controller.begin(second)
    controller.end(second)
    expect(contents.listenerCount("before-input-event")).toBe(0)
    expect(input("Escape")).toBe(false)
  })

  it("does not let the old held press exit a newly entered session", () => {
    const { controller, input, send } = setup()
    controller.begin(first)
    input("Escape")
    controller.begin(second)
    expect(input("Escape", "keyDown", true)).toBe(true)
    expect(input("Escape", "keyUp")).toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    expect(input("Escape")).toBe(true)
    expect(send).toHaveBeenLastCalledWith(CHANNELS.chatInputEscape, second)
  })

  it("cancels all input listeners on blur or window teardown and rejects entry while unfocused", () => {
    const { contents, controller, input, isFocused, send } = setup()
    controller.begin(first)
    controller.blur()
    expect(send).toHaveBeenCalledExactlyOnceWith(CHANNELS.chatInputEscape, first)
    expect(contents.listenerCount("before-input-event")).toBe(0)
    expect(input("Escape")).toBe(false)
    controller.begin(first)
    input("Escape")
    controller.cancel()
    expect(contents.listenerCount("before-input-event")).toBe(0)
    isFocused.mockReturnValue(false)
    expect(() => controller.begin(first)).toThrow(Error)
    expect(contents.listenerCount("before-input-event")).toBe(0)
  })
})
