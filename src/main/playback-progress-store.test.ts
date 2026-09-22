import * as filesystem from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import type { PlaybackBookmark } from "../shared/contracts"
import { PlaybackProgressStore } from "./playback-progress-store"

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...actual,
    rename: vi.fn(actual.rename),
    writeFile: vi.fn(actual.writeFile),
  }
})

const bookmark: PlaybackBookmark = {
  duration: 3600,
  position: 123.5,
  updatedAt: 1_790_000_000_000,
  videoId: "123456",
}

const deferred = () => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

const storedValue = ({ duration, position, updatedAt }: PlaybackBookmark) => ({
  duration,
  position,
  updatedAt,
})

const envelope = (bookmarks: readonly PlaybackBookmark[]) => ({
  bookmarks: Object.fromEntries(bookmarks.map((item) => [item.videoId, storedValue(item)])),
  version: 1,
})

describe("playback progress store", () => {
  let directory = ""
  let path = ""

  beforeEach(async () => {
    vi.mocked(filesystem.rename).mockReset()
    vi.mocked(filesystem.writeFile).mockReset()
    directory = await filesystem.mkdtemp(join(tmpdir(), "vacuumstream-progress-"))
    path = join(directory, "playback-progress.json")
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await filesystem.rm(directory, { recursive: true })
  })

  it("treats a missing file as no bookmarks without creating one", async () => {
    const store = new PlaybackProgressStore(directory)
    await expect(store.get(bookmark.videoId)).resolves.toBeUndefined()
    await expect(store.get("toString")).resolves.toBeUndefined()
    await store.remove(bookmark.videoId)
    await expect(filesystem.readFile(path)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("recovers exact bookmarks from a new store instance and stores only progress metadata", async () => {
    const bookmarks = [
      bookmark,
      { ...bookmark, position: 0, updatedAt: bookmark.updatedAt + 1, videoId: "234567" },
      { ...bookmark, position: bookmark.duration, videoId: "345678" },
    ]
    const store = new PlaybackProgressStore(directory)
    for (const item of bookmarks) await store.save(item)

    const restored = new PlaybackProgressStore(directory)
    for (const item of bookmarks) {
      await expect(restored.get(item.videoId)).resolves.toEqual(item)
    }
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(envelope(bookmarks))
  })

  it("serializes overlapping saves and makes a queued read observe all preceding writes", async () => {
    const store = new PlaybackProgressStore(directory)
    const writing = deferred()
    const releaseWrite = deferred()
    const { writeFile } = await vi.importActual<typeof filesystem>("node:fs/promises")
    const write = vi.mocked(filesystem.writeFile).mockImplementationOnce(async (...args) => {
      writing.resolve()
      await releaseWrite.promise
      await writeFile(...args)
    })
    const firstSave = store.save(bookmark)
    await writing.promise

    const others = Array.from({ length: 12 }, (_, index) => ({
      ...bookmark,
      position: index,
      updatedAt: bookmark.updatedAt + index + 1,
      videoId: String(index),
    }))
    const saves = others.map((item) => store.save(item))
    const last = others.at(-1)
    if (last === undefined) throw new Error("Missing concurrent bookmark")
    const reading = store.get(last.videoId)
    try {
      expect(write).toHaveBeenCalledTimes(1)
    } finally {
      releaseWrite.resolve()
    }
    await expect(reading).resolves.toEqual(last)
    await Promise.all([firstSave, ...saves])

    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(
      envelope([bookmark, ...others]),
    )
    const restored = new PlaybackProgressStore(directory)
    for (const item of [bookmark, ...others]) {
      await expect(restored.get(item.videoId)).resolves.toEqual(item)
    }
  })

  it("orders overlapping saves and removal without resurrecting a bookmark", async () => {
    const store = new PlaybackProgressStore(directory)
    const replacement = { ...bookmark, position: 456, updatedAt: bookmark.updatedAt + 1 }
    const save = store.save(bookmark)
    const replace = store.save(replacement)
    const readReplacement = store.get(bookmark.videoId)
    const remove = store.remove(bookmark.videoId)
    const readRemoved = store.get(bookmark.videoId)
    await expect(readReplacement).resolves.toEqual(replacement)
    await expect(readRemoved).resolves.toBeUndefined()
    await Promise.all([save, replace, remove])
    await expect(
      new PlaybackProgressStore(directory).get(bookmark.videoId),
    ).resolves.toBeUndefined()
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(envelope([]))
  })

  it("evicts the least recently updated bookmark above 100 entries, not the first inserted", async () => {
    const store = new PlaybackProgressStore(directory)
    const bookmarks = Array.from({ length: 100 }, (_, index) => ({
      ...bookmark,
      updatedAt: bookmark.updatedAt + index,
      videoId: String(index),
    }))
    for (const item of bookmarks) await store.save(item)
    const refreshed = { ...bookmark, updatedAt: bookmark.updatedAt + 101, videoId: "0" }
    const added = { ...bookmark, updatedAt: bookmark.updatedAt + 100, videoId: "100" }
    await store.save(refreshed)
    await store.save(added)

    const restored = new PlaybackProgressStore(directory)
    await expect(restored.get("1")).resolves.toBeUndefined()
    await expect(restored.get("0")).resolves.toEqual(refreshed)
    await expect(restored.get("100")).resolves.toEqual(added)
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(
      envelope([...bookmarks.slice(2), refreshed, added]),
    )
  })

  it.each([
    ["invalid JSON", "{"],
    ["unsupported version", JSON.stringify({ bookmarks: {}, version: 2 })],
    ["missing envelope", JSON.stringify({})],
    ["out-of-range position", JSON.stringify(envelope([{ ...bookmark, position: 3601 }]))],
    [
      "non-finite value",
      '{"bookmarks":{"123":{"duration":1e309,"position":0,"updatedAt":1}},"version":1}',
    ],
    ["invalid duration", JSON.stringify(envelope([{ ...bookmark, duration: 0 }]))],
    ["over-long id", JSON.stringify(envelope([{ ...bookmark, videoId: "x".repeat(65) }]))],
    ["invalid timestamp", JSON.stringify(envelope([{ ...bookmark, updatedAt: -1 }]))],
    ["reserved key", JSON.stringify(envelope([{ ...bookmark, videoId: "__proto__" }]))],
    [
      "extra metadata",
      JSON.stringify({
        bookmarks: { "123": { ...storedValue(bookmark), title: "private" } },
        version: 1,
      }),
    ],
    [
      "too many bookmarks",
      JSON.stringify(
        envelope(
          Array.from({ length: 101 }, (_, index) => ({ ...bookmark, videoId: String(index) })),
        ),
      ),
    ],
  ])("surfaces %s on read and mutations without overwriting the file", async (_name, contents) => {
    await filesystem.writeFile(path, contents)
    const store = new PlaybackProgressStore(directory)
    await expect(store.get(bookmark.videoId)).rejects.toThrow()
    await expect(store.save(bookmark)).rejects.toThrow()
    await expect(store.remove(bookmark.videoId)).rejects.toThrow()
    expect(await filesystem.readFile(path, "utf8")).toBe(contents)
  })

  it.each([
    { ...bookmark, position: -1 },
    { ...bookmark, position: bookmark.duration + 1 },
    { ...bookmark, position: Number.NaN },
    { ...bookmark, position: Number.POSITIVE_INFINITY },
    { ...bookmark, duration: Number.NEGATIVE_INFINITY },
    { ...bookmark, duration: 0 },
    { ...bookmark, duration: -1 },
    { ...bookmark, videoId: "" },
    { ...bookmark, videoId: "x".repeat(65) },
    { ...bookmark, videoId: "__proto__" },
    { ...bookmark, updatedAt: Number.NaN },
    { ...bookmark, updatedAt: -1 },
    { ...bookmark, updatedAt: 1.5 },
    { ...bookmark, title: "private" },
  ])("rejects invalid saves before writing: %j", async (input) => {
    await expect(new PlaybackProgressStore(directory).save(input)).rejects.toBeInstanceOf(
      z.ZodError,
    )
    await expect(filesystem.readFile(path)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("rejects unbounded ids on get and remove", async () => {
    const store = new PlaybackProgressStore(directory)
    for (const videoId of ["", "x".repeat(65), "__proto__"]) {
      await expect(store.get(videoId)).rejects.toBeInstanceOf(z.ZodError)
      await expect(store.remove(videoId)).rejects.toBeInstanceOf(z.ZodError)
    }
  })

  it("surfaces read I/O failures instead of treating them as missing data", async () => {
    await filesystem.mkdir(path)
    const store = new PlaybackProgressStore(directory)
    await expect(store.get(bookmark.videoId)).rejects.toMatchObject({ code: "EISDIR" })
    await expect(store.save(bookmark)).rejects.toMatchObject({ code: "EISDIR" })
    await expect(store.remove(bookmark.videoId)).rejects.toMatchObject({ code: "EISDIR" })
  })

  it("surfaces failed atomic writes, preserves previous data and allows a later save", async () => {
    const store = new PlaybackProgressStore(directory)
    await store.save(bookmark)
    const failure = new Error("Atomic rename failed")
    vi.mocked(filesystem.rename).mockRejectedValueOnce(failure)
    const replacement = { ...bookmark, position: 456, updatedAt: bookmark.updatedAt + 1 }
    await expect(store.save(replacement)).rejects.toBe(failure)
    await expect(store.get(bookmark.videoId)).resolves.toEqual(bookmark)
    await expect(filesystem.readFile(`${path}.tmp`)).rejects.toMatchObject({ code: "ENOENT" })
    await store.save(replacement)
    await expect(new PlaybackProgressStore(directory).get(bookmark.videoId)).resolves.toEqual(
      replacement,
    )
  })

  it("writes owner-only temporary and final files, replacing permissive leftovers", async () => {
    await filesystem.writeFile(path, JSON.stringify(envelope([])), { mode: 0o644 })
    await filesystem.writeFile(`${path}.tmp`, "leftover", { mode: 0o644 })
    const { rename } = await vi.importActual<typeof filesystem>("node:fs/promises")
    const modes: number[] = []
    vi.mocked(filesystem.rename).mockImplementationOnce(async (source, destination) => {
      modes.push((await filesystem.stat(source)).mode & 0o777)
      await rename(source, destination)
    })

    await new PlaybackProgressStore(directory).save(bookmark)
    expect(modes).toEqual([0o600])
    expect((await filesystem.stat(path)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(envelope([bookmark]))
    await expect(filesystem.readFile(`${path}.tmp`)).rejects.toMatchObject({ code: "ENOENT" })
  })
})
