// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest"
import { listProgress, queueProgress } from "./playback-progress"

const deferred = <T>() => {
  let accept: (value: T) => void = () => {
    throw new Error("Missing resolver")
  }
  let fail: (error: Error) => void = () => {
    throw new Error("Missing rejecter")
  }
  const promise = new Promise<T>((resolve, reject) => {
    accept = resolve
    fail = reject
  })
  return { promise, reject: fail, resolve: accept }
}

afterEach(() => vi.unstubAllGlobals())

describe("renderer playback progress ordering", () => {
  it("waits for already-queued mutations across recordings before invoking list IPC", async () => {
    const first = deferred<void>()
    const saveEntered = deferred<void>()
    const queued = deferred<void>()
    const other = deferred<void>()
    const entered = deferred<void>()
    const calls: string[] = []
    const list = vi.fn(async () => {
      calls.push("list")
      return []
    })
    vi.stubGlobal("vacuumStream", { playbackProgress: { list } })
    const save = queueProgress("one", async () => {
      calls.push("save")
      saveEntered.resolve(undefined)
      await first.promise
    })
    const remove = queueProgress("one", async () => {
      calls.push("remove")
      entered.resolve(undefined)
      await queued.promise
    })
    const independent = queueProgress("two", () => other.promise)
    const listing = listProgress()
    await saveEntered.promise
    expect(calls).toEqual(["save"])
    first.resolve(undefined)
    await entered.promise
    expect(calls).toEqual(["save", "remove"])
    queued.resolve(undefined)
    await remove
    expect(list).not.toHaveBeenCalled()
    other.resolve(undefined)
    await Promise.all([save, independent, listing])
    expect(calls).toEqual(["save", "remove", "list"])
  })

  it("reports mutation rejections to callers without poisoning lookups or listings", async () => {
    const failure = deferred<void>()
    const list = vi.fn(async () => [])
    vi.stubGlobal("vacuumStream", { playbackProgress: { list } })
    const write = queueProgress("failed", () => failure.promise)
    const rejected = expect(write).rejects.toThrow("Disk full")
    const get = vi.fn(async () => "old bookmark")
    const lookup = queueProgress("failed", get)
    const listing = listProgress()
    failure.reject(new Error("Disk full"))
    await rejected
    expect(await lookup).toBe("old bookmark")
    expect(await listing).toEqual([])
    expect(list).toHaveBeenCalledTimes(1)
  })

  it("does not block a removal behind an obsolete read and propagates read failures", async () => {
    const read = deferred<readonly never[]>()
    const entered = deferred<void>()
    vi.stubGlobal("vacuumStream", {
      playbackProgress: {
        list: () => {
          entered.resolve(undefined)
          return read.promise
        },
      },
    })
    const listing = listProgress()
    const rejected = expect(listing).rejects.toThrow("Read failed")
    await entered.promise
    const remove = vi.fn(async () => undefined)
    await queueProgress("one", remove)
    expect(remove).toHaveBeenCalledTimes(1)
    read.reject(new Error("Read failed"))
    await rejected
  })
})
