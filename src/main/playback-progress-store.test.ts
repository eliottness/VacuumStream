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
    readFile: vi.fn(actual.readFile),
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

const storedValue = ({ videoId: _videoId, ...value }: PlaybackBookmark) => value

const envelope = (bookmarks: readonly PlaybackBookmark[]) => ({
  bookmarks: Object.fromEntries(bookmarks.map((item) => [item.videoId, storedValue(item)])),
  version: 2,
})

describe("playback progress store", () => {
  let directory = ""
  let path = ""

  beforeEach(async () => {
    vi.mocked(filesystem.readFile).mockReset()
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
    await expect(store.list()).resolves.toEqual([])
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

  it("reads handwritten version-1 bookmarks losslessly and migrates only on a later save", async () => {
    const legacy = `{
      "bookmarks": {
        "legacy-start": { "duration": 900, "position": 0, "updatedAt": 10 },
        "legacy-fraction": { "duration": 3600.75, "position": 123.456789, "updatedAt": 20 },
        "toString": { "duration": 1800.25, "position": 1800.25, "updatedAt": 30 }
      },
      "version": 1
    }`
    const expected = [
      { duration: 1800.25, position: 1800.25, updatedAt: 30, videoId: "toString" },
      { duration: 3600.75, position: 123.456789, updatedAt: 20, videoId: "legacy-fraction" },
      { duration: 900, position: 0, updatedAt: 10, videoId: "legacy-start" },
    ]
    await filesystem.writeFile(path, legacy)
    const store = new PlaybackProgressStore(directory)
    await expect(store.list()).resolves.toEqual(expected)
    for (const item of expected) await expect(store.get(item.videoId)).resolves.toEqual(item)
    expect(await filesystem.readFile(path, "utf8")).toBe(legacy)

    await store.save(bookmark)
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(
      envelope([...expected, bookmark]),
    )
    const restored = new PlaybackProgressStore(directory)
    await expect(restored.list()).resolves.toEqual([bookmark, ...expected])
    for (const item of expected) {
      await expect(restored.get(item.videoId)).resolves.toEqual(item)
      expect(await restored.get(item.videoId)).not.toHaveProperty("details")
    }
  })

  it("writes version 2 when removing a legacy bookmark and preserves the other entries", async () => {
    const remaining = { ...bookmark, videoId: "remaining" }
    await filesystem.writeFile(
      path,
      JSON.stringify({ ...envelope([bookmark, remaining]), version: 1 }),
    )
    await new PlaybackProgressStore(directory).remove(bookmark.videoId)
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(envelope([remaining]))
    await expect(new PlaybackProgressStore(directory).list()).resolves.toEqual([remaining])
  })

  it("round-trips optional display metadata at both string bounds without changing legacy values", async () => {
    const bookmarks = [
      bookmark,
      { ...bookmark, details: { title: "T", userId: "U" }, videoId: "short" },
      {
        ...bookmark,
        details: { title: "T".repeat(300), userId: "U".repeat(64) },
        videoId: "long",
      },
    ]
    const store = new PlaybackProgressStore(directory)
    for (const item of bookmarks) await store.save(item)
    const restored = new PlaybackProgressStore(directory)
    for (const item of bookmarks) await expect(restored.get(item.videoId)).resolves.toEqual(item)
    await expect(restored.list()).resolves.toEqual([bookmarks[0], bookmarks[2], bookmarks[1]])
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(envelope(bookmarks))
  })

  it("lists newest bookmarks first with ascending video ids breaking timestamp ties", async () => {
    const oldest = { ...bookmark, updatedAt: 1, videoId: "oldest" }
    const newest = { ...bookmark, updatedAt: 3, videoId: "newest" }
    const ties = ["10", "2", "A", "a", "z"].map((videoId) => ({
      ...bookmark,
      updatedAt: 2,
      videoId,
    }))
    const store = new PlaybackProgressStore(directory)
    for (const item of [oldest, ...ties.slice().reverse(), newest]) await store.save(item)
    const expected = [newest, ...ties, oldest]
    await expect(store.list()).resolves.toEqual(expected)
    await expect(new PlaybackProgressStore(directory).list()).resolves.toEqual(expected)
  })

  it.each(["save", "remove"] as const)(
    "serializes list behind an in-flight %s",
    async (mutation) => {
      const store = new PlaybackProgressStore(directory)
      await store.save(bookmark)
      vi.mocked(filesystem.readFile).mockClear()
      const replacement = { ...bookmark, position: 456 }
      const renaming = deferred()
      const releaseRename = deferred()
      const committed = vi.fn()
      const { rename } = await vi.importActual<typeof filesystem>("node:fs/promises")
      vi.mocked(filesystem.rename).mockImplementationOnce(async (...args) => {
        renaming.resolve()
        await releaseRename.promise
        await rename(...args)
        committed()
      })
      const mutating =
        mutation === "save" ? store.save(replacement) : store.remove(bookmark.videoId)
      await renaming.promise
      const listing = store.list()
      releaseRename.resolve()
      const [, result] = await Promise.all([mutating, listing])
      expect(result).toEqual(mutation === "save" ? [replacement] : [])
      expect(filesystem.readFile).toHaveBeenCalledTimes(2)
      expect(committed).toHaveBeenCalledExactlyOnceWith()
      expect(vi.mocked(filesystem.readFile).mock.invocationCallOrder[1]).toBeGreaterThan(
        committed.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      )
    },
  )

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
    const listing = await restored.list()
    expect(listing).toHaveLength(100)
    expect(listing).toEqual([refreshed, added, ...bookmarks.slice(2).reverse()])
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(
      envelope([...bookmarks.slice(2), refreshed, added]),
    )
  })

  it.each([
    ["invalid JSON", "{"],
    ["unsupported future version", JSON.stringify({ ...envelope([bookmark]), version: 3 })],
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
    await expect(store.list()).rejects.toThrow()
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

  it.each([
    null,
    "title",
    [],
    {},
    { title: "Recording" },
    { userId: "123" },
    { title: 123, userId: "123" },
    { title: "Recording", userId: 123 },
    { title: "", userId: "123" },
    { title: "Recording", userId: "" },
    { title: "T".repeat(301), userId: "123" },
    { title: "Recording", userId: "U".repeat(65) },
    { title: "Recording", url: "https://example.com", userId: "123" },
  ])("rejects malformed or over-long display metadata before writing: %j", async (details) => {
    const store = new PlaybackProgressStore(directory)
    await store.save(bookmark)
    const contents = await filesystem.readFile(path, "utf8")
    vi.mocked(filesystem.writeFile).mockClear()
    vi.mocked(filesystem.rename).mockClear()
    await expect(store.save({ ...bookmark, details } as PlaybackBookmark)).rejects.toBeInstanceOf(
      z.ZodError,
    )
    expect(filesystem.writeFile).not.toHaveBeenCalled()
    expect(filesystem.rename).not.toHaveBeenCalled()
    expect(await filesystem.readFile(path, "utf8")).toBe(contents)
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
    await expect(store.list()).rejects.toMatchObject({ code: "EISDIR" })
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
