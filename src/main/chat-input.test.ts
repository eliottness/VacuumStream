import { EventEmitter } from "node:events"
import type { BrowserWindow, Input, WebFrameMain } from "electron"
import { describe, expect, it, vi } from "vitest"
import { CHANNELS } from "../shared/channels"
import { createChatInput } from "./chat-input"

const setup = () => {
  const send = vi.fn()
  let attached = false
  const debuggerApi = Object.assign(new EventEmitter(), {
    attach: vi.fn(() => {
      attached = true
    }),
    detach: vi.fn(() => {
      attached = false
      debuggerApi.emit("detach", {}, "target closed")
    }),
    isAttached: vi.fn(() => attached),
    sendCommand: vi.fn<(method: string, params: unknown) => Promise<unknown>>(async () => ({})),
  })
  const mainFrame = { frames: [] as WebFrameMain[] }
  const frame = {
    detached: false,
    isDestroyed: vi.fn(() => false),
    parent: mainFrame,
    top: mainFrame,
    url: "https://www.twitch.tv/embed/twitch/chat?parent=localhost",
  }
  mainFrame.frames = [frame as unknown as WebFrameMain]
  const contents = Object.assign(new EventEmitter(), {
    debugger: debuggerApi,
    focusedFrame: frame as unknown as WebFrameMain | null,
    isDestroyed: vi.fn(() => false),
    mainFrame,
    send,
  })
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
  return { contents, controller, debuggerApi, frame, input, isFocused, mainFrame, send }
}

const first = "81c9fdf9-2f3c-4e75-a10d-8694e97843da"
const second = "c7e5c334-ab25-401a-a21c-8fc9e9c6fce2"

const deferred = () => {
  let resolve: ((value: unknown) => void) | undefined
  let reject: ((cause: Error) => void) | undefined
  const promise = new Promise<unknown>((accept, fail) => {
    resolve = accept
    reject = fail
  })
  return {
    promise,
    reject: (cause: Error) => {
      if (reject === undefined) throw new Error("Missing rejection callback")
      reject(cause)
    },
    resolve: (value: unknown) => {
      if (resolve === undefined) throw new Error("Missing resolution callback")
      resolve(value)
    },
  }
}

const tab = { code: "Tab", key: "Tab", modifiers: 0, windowsVirtualKeyCode: 9 }
const enter = { code: "Enter", key: "Enter", modifiers: 0, windowsVirtualKeyCode: 13 }
const command = (params: object) => ["Input.dispatchKeyEvent", params]

const expectRemoved = (harness: ReturnType<typeof setup>) => {
  expect(harness.contents.listenerCount("before-input-event")).toBe(0)
  expect(harness.contents.listenerCount("did-start-navigation")).toBe(0)
  expect(harness.contents.listenerCount("render-process-gone")).toBe(0)
  expect(harness.debuggerApi.listenerCount("detach")).toBe(0)
}

describe("bounded native chat transport", () => {
  it("lazily attaches and serializes exactly balanced Tab, Shift+Tab and Enter pairs", async () => {
    const { controller, debuggerApi } = setup()
    controller.begin(first)
    expect(debuggerApi.attach).not.toHaveBeenCalled()
    const started = deferred()
    const completion = deferred()
    debuggerApi.sendCommand.mockImplementationOnce(() => {
      started.resolve(undefined)
      return completion.promise
    })
    const next = controller.press(first, "next")
    const previous = controller.press(first, "previous")
    const activate = controller.press(first, "activate")
    await started.promise
    expect(debuggerApi.sendCommand.mock.calls).toEqual([
      command({ ...tab, type: "keyDown" }),
      command({ ...tab, type: "keyUp" }),
    ])
    completion.resolve({})
    await Promise.all([next, previous, activate])
    expect(debuggerApi.attach).toHaveBeenCalledExactlyOnceWith("1.3")
    expect(debuggerApi.sendCommand.mock.calls).toEqual([
      command({ ...tab, type: "keyDown" }),
      command({ ...tab, type: "keyUp" }),
      command({ ...tab, modifiers: 8, type: "keyDown" }),
      command({ ...tab, modifiers: 8, type: "keyUp" }),
      command({ ...enter, text: "\r", type: "keyDown" }),
      command({ ...enter, type: "keyUp" }),
    ])
    controller.end(first)
    expect(debuggerApi.detach).toHaveBeenCalledExactlyOnceWith()
  })

  it("rejects missing and stale sessions before attachment or dispatch without ending the current session", async () => {
    const { controller, debuggerApi, contents } = setup()
    await expect(controller.press(first, "next")).rejects.toThrow("expired")
    controller.begin(second)
    await expect(controller.press(first, "activate")).rejects.toThrow("expired")
    expect(debuggerApi.attach).not.toHaveBeenCalled()
    expect(debuggerApi.sendCommand).not.toHaveBeenCalled()
    expect(contents.listenerCount("before-input-event")).toBe(1)
    controller.end(second)
  })

  it.each([
    "unfocused",
    "no-focus",
    "shell",
    "foreign",
    "nested",
    "removed",
    "detached",
    "destroyed",
    "replacement",
  ] as const)("rejects %s focus before any attachment or dispatch", async (reason) => {
    const harness = setup()
    const { contents, controller, debuggerApi, frame, isFocused, mainFrame } = harness
    controller.begin(first)
    switch (reason) {
      case "unfocused":
        isFocused.mockReturnValue(false)
        break
      case "no-focus":
        contents.focusedFrame = null
        break
      case "shell":
        contents.focusedFrame = mainFrame as unknown as WebFrameMain
        break
      case "foreign":
        frame.top = { frames: [] }
        break
      case "nested":
        frame.parent = { frames: [] }
        break
      case "removed":
        mainFrame.frames = []
        break
      case "detached":
        frame.detached = true
        break
      case "destroyed":
        frame.isDestroyed.mockReturnValue(true)
        break
      case "replacement":
        contents.focusedFrame = { ...frame } as unknown as WebFrameMain
        break
    }
    await expect(controller.press(first, "next")).rejects.toThrow()
    expect(debuggerApi.attach).not.toHaveBeenCalled()
    expect(debuggerApi.sendCommand).not.toHaveBeenCalled()
    expectRemoved(harness)
  })

  it.each([
    "https://player.twitch.tv/?channel=twitch&parent=localhost",
    "https://www.twitch.tv/twitch/chat",
    "http://www.twitch.tv/embed/twitch/chat?parent=localhost",
    "https://www.twitch.tv.evil.test/embed/twitch/chat?parent=localhost",
    "https://www.twitch.tv/embed/twitch/chat?parent=evil.test",
    "https://www.twitch.tv/embed/twitch/chat?parent=localhost&extra=1",
    "https://www.twitch.tv/embed/twitch/chat?parent=localhost#other",
    "https://www.twitch.tv/embed/two%2Fparts/chat?parent=localhost",
    "about:blank",
  ])("rejects non-chat frame URL %s before dispatch", async (url) => {
    const { controller, debuggerApi, frame } = setup()
    frame.url = url
    controller.begin(first)
    await expect(controller.press(first, "activate")).rejects.toThrow()
    expect(debuggerApi.attach).not.toHaveBeenCalled()
    expect(debuggerApi.sendCommand).not.toHaveBeenCalled()
  })

  it("rechecks a changed channel URL before dispatching queued work", async () => {
    const { controller, debuggerApi, frame } = setup()
    controller.begin(first)
    const press = controller.press(first, "next")
    frame.url = "https://www.twitch.tv/embed/other/chat?parent=localhost"
    await expect(press).rejects.toThrow()
    expect(debuggerApi.sendCommand).not.toHaveBeenCalled()
  })

  it.each(["exit", "reload", "source", "blur", "navigation", "crash", "detach"] as const)(
    "cancels queued actions and removes listeners after pending dispatch then %s",
    async (reason) => {
      const harness = setup()
      const { contents, controller, debuggerApi, frame } = harness
      const started = deferred()
      const completion = deferred()
      debuggerApi.sendCommand.mockImplementationOnce(() => {
        started.resolve(undefined)
        return completion.promise
      })
      controller.begin(first)
      const pending = controller.press(first, "next")
      const queued = controller.press(first, "activate")
      await started.promise
      switch (reason) {
        case "exit":
          controller.end(first)
          break
        case "reload":
          contents.emit("did-start-navigation", { frame, isMainFrame: false })
          break
        case "source":
          controller.begin(second)
          controller.end(second)
          break
        case "blur":
          controller.blur()
          break
        case "navigation":
          contents.emit("did-start-navigation", { isMainFrame: true })
          break
        case "crash":
          contents.emit("render-process-gone")
          break
        case "detach":
          debuggerApi.emit("detach", {}, "replaced")
          break
      }
      expectRemoved(harness)
      expect(debuggerApi.detach).toHaveBeenCalledTimes(reason === "detach" ? 0 : 1)
      completion.resolve({})
      await Promise.all([pending, queued])
      expect(debuggerApi.sendCommand.mock.calls).toEqual([
        command({ ...tab, type: "keyDown" }),
        command({ ...tab, type: "keyUp" }),
      ])
      if (reason === "detach") {
        expect(harness.send).toHaveBeenCalledExactlyOnceWith(
          CHANNELS.chatInputEscape,
          first,
          "transport",
        )
      }
    },
  )

  it.each(["busy", "attach", "command"] as const)(
    "surfaces %s failure without stealing attachments and keeps keyboard-only entry usable",
    async (reason) => {
      const harness = setup()
      const { controller, debuggerApi, input, send } = harness
      if (reason === "busy") debuggerApi.isAttached.mockReturnValue(true)
      if (reason === "attach")
        debuggerApi.attach.mockImplementationOnce(() => {
          throw new Error("busy")
        })
      if (reason === "command")
        debuggerApi.sendCommand.mockRejectedValueOnce(new Error("CDP rejected"))
      controller.begin(first)
      expect(debuggerApi.attach).not.toHaveBeenCalled()
      for (const key of ["Tab", "Enter"]) expect(input(key)).toBe(false)
      await expect(controller.press(first, "next")).rejects.toThrow()
      expect(send).toHaveBeenCalledExactlyOnceWith(CHANNELS.chatInputEscape, first, "transport")
      expectRemoved(harness)
      expect(debuggerApi.detach).toHaveBeenCalledTimes(reason === "command" ? 1 : 0)
      if (reason !== "command") expect(debuggerApi.sendCommand).not.toHaveBeenCalled()
      controller.begin(second)
      for (const key of ["Tab", "Enter"]) expect(input(key)).toBe(false)
      expect(input("Escape")).toBe(true)
      expect(send).toHaveBeenLastCalledWith(CHANNELS.chatInputEscape, second)
      input("Escape", "keyUp")
      expectRemoved(harness)
    },
  )

  it("ignores old rejected completions after a replacement session and never detaches its debugger", async () => {
    const { controller, debuggerApi, send } = setup()
    const started = deferred()
    const completion = deferred()
    debuggerApi.sendCommand.mockImplementationOnce(() => {
      started.resolve(undefined)
      return completion.promise
    })
    controller.begin(first)
    const old = controller.press(first, "next")
    const rejected = expect(old).rejects.toThrow("late")
    await started.promise
    controller.end(first)
    controller.begin(second)
    const next = controller.press(second, "previous")
    completion.reject(new Error("late"))
    await rejected
    await next
    expect(debuggerApi.attach).toHaveBeenCalledTimes(2)
    expect(debuggerApi.detach).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
    controller.end(second)
  })
})

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
