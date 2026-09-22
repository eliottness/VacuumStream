import * as filesystem from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { FAVOURITES_LIMIT_ERROR, type Favourite } from "../shared/contracts"
import { FavouritesLimitError, FavouritesStore } from "./favourites-store"

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...actual,
    chmod: vi.fn(actual.chmod),
    readFile: vi.fn(actual.readFile),
    rename: vi.fn(actual.rename),
    writeFile: vi.fn(actual.writeFile),
  }
})

const deferred = () => {
  let resolve: () => void = () => undefined
  const promise = new Promise<void>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}
const envelope = (favourites: readonly Favourite[]) => ({ favourites, version: 1 })
const favourite: Favourite = { login: "streamer", userId: "123" }

describe("favourites store", () => {
  let directory = ""
  let path = ""

  beforeEach(async () => {
    vi.mocked(filesystem.chmod).mockReset()
    vi.mocked(filesystem.readFile).mockReset()
    vi.mocked(filesystem.rename).mockReset()
    vi.mocked(filesystem.writeFile).mockReset()
    directory = await filesystem.mkdtemp(join(tmpdir(), "vacuumstream-favourites-"))
    path = join(directory, "favourites.json")
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await filesystem.rm(directory, { recursive: true })
  })

  it("treats a missing file as an empty list without creating one", async () => {
    const store = new FavouritesStore(directory)
    await expect(store.list()).resolves.toEqual([])
    await expect(store.remove("missing")).resolves.toEqual([])
    await expect(filesystem.readFile(path)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it("recovers the identical canonical, duplicate-free, sorted list from a new instance", async () => {
    const store = new FavouritesStore(directory)
    for (const entry of [
      { login: "Zulu", userId: "3" },
      { login: "ALPHA", userId: "1" },
      { login: "middle_2" },
      { login: "aLpHa", userId: "1" },
    ]) {
      await store.add(entry)
    }
    const expected = [
      { login: "alpha", userId: "1" },
      { login: "middle_2" },
      { login: "zulu", userId: "3" },
    ]
    await expect(store.list()).resolves.toEqual(expected)
    await expect(new FavouritesStore(directory).list()).resolves.toEqual(expected)
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(envelope(expected))
  })

  it("deduplicates mixed-case logins and preserves or enriches the real user id", async () => {
    const store = new FavouritesStore(directory)
    await expect(store.add({ login: "Streamer" })).resolves.toEqual([{ login: "streamer" }])
    await expect(store.add(favourite)).resolves.toEqual([favourite])
    await expect(store.add({ login: "STREAMER" })).resolves.toEqual([favourite])
    await expect(store.add(favourite)).resolves.toEqual([favourite])
    await expect(new FavouritesStore(directory).list()).resolves.toEqual([favourite])
  })

  it("accepts both login and user id length bounds", async () => {
    const store = new FavouritesStore(directory)
    const first = { login: "0", userId: "1" }
    const last = { login: "z".repeat(25), userId: "2".repeat(64) }
    await store.add(last)
    await expect(store.add(first)).resolves.toEqual([first, last])
    await expect(new FavouritesStore(directory).list()).resolves.toEqual([first, last])
  })

  it("returns the committed sorted list after case-insensitive removal", async () => {
    const store = new FavouritesStore(directory)
    await store.add(favourite)
    await store.add({ login: "alpha" })
    await expect(store.remove("STREAMER")).resolves.toEqual([{ login: "alpha" }])
    await expect(store.remove("missing")).resolves.toEqual([{ login: "alpha" }])
    await expect(new FavouritesStore(directory).list()).resolves.toEqual([{ login: "alpha" }])
  })

  it.each(["direct-streamer", "direct-", "", "x".repeat(65)])(
    "refuses synthetic or unbounded user ids before writing: %s",
    async (userId) => {
      const store = new FavouritesStore(directory)
      await store.add(favourite)
      const contents = await filesystem.readFile(path, "utf8")
      vi.mocked(filesystem.writeFile).mockClear()
      vi.mocked(filesystem.rename).mockClear()
      await expect(store.add({ login: favourite.login, userId })).rejects.toBeInstanceOf(z.ZodError)
      expect(filesystem.writeFile).not.toHaveBeenCalled()
      expect(filesystem.rename).not.toHaveBeenCalled()
      expect(await filesystem.readFile(path, "utf8")).toBe(contents)
    },
  )

  it.each(["", "x".repeat(26), "has-dash", "two words", " padded ", "é", "channel\n"])(
    "rejects invalid logins on add and remove before reading or writing: %j",
    async (login) => {
      const store = new FavouritesStore(directory)
      await expect(store.add({ login })).rejects.toBeInstanceOf(z.ZodError)
      await expect(store.remove(login)).rejects.toBeInstanceOf(z.ZodError)
      expect(filesystem.readFile).not.toHaveBeenCalled()
      expect(filesystem.writeFile).not.toHaveBeenCalled()
      expect(filesystem.rename).not.toHaveBeenCalled()
    },
  )

  it("fails the 51st distinct add with the limit error without eviction or changed bytes", async () => {
    const store = new FavouritesStore(directory)
    const entries = Array.from({ length: 50 }, (_, index) => ({
      login: `channel${String(index).padStart(2, "0")}`,
    }))
    for (const entry of entries) await store.add(entry)
    const contents = await filesystem.readFile(path, "utf8")
    vi.mocked(filesystem.writeFile).mockClear()
    const adding = store.add({ login: "overflow" })
    await expect(adding).rejects.toBeInstanceOf(FavouritesLimitError)
    await expect(adding).rejects.toMatchObject({
      code: FAVOURITES_LIMIT_ERROR,
      message: expect.stringContaining(FAVOURITES_LIMIT_ERROR),
      name: "FavouritesLimitError",
    })
    expect(filesystem.writeFile).not.toHaveBeenCalled()
    expect(await filesystem.readFile(path, "utf8")).toBe(contents)
    await expect(new FavouritesStore(directory).list()).resolves.toEqual(entries)
    await expect(store.add({ login: "CHANNEL00" })).resolves.toEqual(entries)
    await store.remove("CHANNEL00")
    await expect(store.add({ login: "overflow" })).resolves.toEqual([
      ...entries.slice(1),
      { login: "overflow" },
    ])
  })

  it("serializes controlled overlapping adds, removal and listing without lost updates", async () => {
    const store = new FavouritesStore(directory)
    await store.add({ login: "remove_me" })
    const writing = deferred()
    const releaseWrite = deferred()
    const { writeFile } = await vi.importActual<typeof filesystem>("node:fs/promises")
    vi.mocked(filesystem.writeFile)
      .mockClear()
      .mockImplementationOnce(async (...args) => {
        writing.resolve()
        await releaseWrite.promise
        await writeFile(...args)
      })
    const first = store.add({ login: "zulu" })
    await writing.promise
    const second = store.add({ login: "ALPHA", userId: "1" })
    const removing = store.remove("REMOVE_ME")
    const duplicate = store.add({ login: "alpha" })
    const listing = store.list()
    try {
      expect(filesystem.writeFile).toHaveBeenCalledTimes(1)
    } finally {
      releaseWrite.resolve()
    }
    const expected = [{ login: "alpha", userId: "1" }, { login: "zulu" }]
    await expect(Promise.all([first, second, removing, duplicate, listing])).resolves.toEqual([
      [{ login: "remove_me" }, { login: "zulu" }],
      [{ login: "alpha", userId: "1" }, { login: "remove_me" }, { login: "zulu" }],
      expected,
      expected,
      expected,
    ])
    await expect(new FavouritesStore(directory).list()).resolves.toEqual(expected)
  })

  it.each(["add", "remove"] as const)(
    "resolves %s with its committed list only after atomic rename completes",
    async (method) => {
      const store = new FavouritesStore(directory)
      await store.add(favourite)
      const renaming = deferred()
      const releaseRename = deferred()
      const settled = vi.fn()
      const { rename } = await vi.importActual<typeof filesystem>("node:fs/promises")
      vi.mocked(filesystem.rename).mockImplementationOnce(async (...args) => {
        renaming.resolve()
        await releaseRename.promise
        await rename(...args)
      })
      const mutation = (
        method === "add" ? store.add({ login: "alpha" }) : store.remove(favourite.login)
      ).then((result) => {
        settled()
        return result
      })
      await renaming.promise
      const listing = store.list()
      try {
        expect(settled).not.toHaveBeenCalled()
        expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(envelope([favourite]))
      } finally {
        releaseRename.resolve()
      }
      const expected = method === "add" ? [{ login: "alpha" }, favourite] : []
      await expect(mutation).resolves.toEqual(expected)
      await expect(listing).resolves.toEqual(expected)
      expect(settled).toHaveBeenCalledExactlyOnceWith()
    },
  )

  it.each([
    ["malformed JSON", "{"],
    ["unknown future version", JSON.stringify({ ...envelope([favourite]), version: 2 })],
    ["missing envelope", "{}"],
    ["invalid login", JSON.stringify(envelope([{ login: "invalid-login" }]))],
    ["synthetic id", JSON.stringify(envelope([{ login: "streamer", userId: "direct-streamer" }]))],
    ["duplicate login", JSON.stringify(envelope([favourite, { login: "STREAMER" }]))],
    [
      "unknown entry fields",
      JSON.stringify({ favourites: [{ ...favourite, title: "private" }], version: 1 }),
    ],
    ["unknown envelope fields", JSON.stringify({ ...envelope([]), path: "private" })],
    [
      "oversized list",
      JSON.stringify(envelope(Array.from({ length: 51 }, (_, index) => ({ login: `c${index}` })))),
    ],
  ])("surfaces %s on reads and mutations without overwriting bytes", async (_name, contents) => {
    await filesystem.writeFile(path, contents)
    vi.mocked(filesystem.writeFile).mockClear()
    const store = new FavouritesStore(directory)
    await expect(store.list()).rejects.toThrow()
    await expect(store.add(favourite)).rejects.toThrow()
    await expect(store.remove(favourite.login)).rejects.toThrow()
    expect(filesystem.writeFile).not.toHaveBeenCalled()
    expect(filesystem.rename).not.toHaveBeenCalled()
    expect(await filesystem.readFile(path, "utf8")).toBe(contents)
  })

  it("surfaces read I/O errors without treating them as missing data or overwriting bytes", async () => {
    const store = new FavouritesStore(directory)
    await store.add(favourite)
    const contents = await filesystem.readFile(path, "utf8")
    const failure = Object.assign(new Error("Permission denied"), { code: "EACCES" })
    vi.mocked(filesystem.readFile).mockRejectedValue(failure)
    vi.mocked(filesystem.writeFile).mockClear()
    await expect(store.list()).rejects.toBe(failure)
    await expect(store.add({ login: "alpha" })).rejects.toBe(failure)
    await expect(store.remove(favourite.login)).rejects.toBe(failure)
    expect(filesystem.writeFile).not.toHaveBeenCalled()
    vi.mocked(filesystem.readFile).mockReset()
    expect(await filesystem.readFile(path, "utf8")).toBe(contents)
  })

  it("surfaces failed atomic writes, preserves prior bytes and permits a later mutation", async () => {
    const store = new FavouritesStore(directory)
    await store.add(favourite)
    const contents = await filesystem.readFile(path, "utf8")
    const failure = new Error("Atomic rename failed")
    vi.mocked(filesystem.rename).mockRejectedValueOnce(failure)
    await expect(store.add({ login: "alpha" })).rejects.toBe(failure)
    expect(await filesystem.readFile(path, "utf8")).toBe(contents)
    await expect(filesystem.readFile(`${path}.tmp`)).rejects.toMatchObject({ code: "ENOENT" })
    await expect(store.add({ login: "alpha" })).resolves.toEqual([{ login: "alpha" }, favourite])
    await expect(new FavouritesStore(directory).list()).resolves.toEqual([
      { login: "alpha" },
      favourite,
    ])
  })

  it("writes owner-only temporary and final files and replaces permissive leftovers", async () => {
    await filesystem.writeFile(path, JSON.stringify(envelope([])), { mode: 0o644 })
    await filesystem.writeFile(`${path}.tmp`, "leftover", { mode: 0o644 })
    const { rename } = await vi.importActual<typeof filesystem>("node:fs/promises")
    const modes: number[] = []
    vi.mocked(filesystem.rename).mockImplementationOnce(async (source, destination) => {
      modes.push((await filesystem.stat(source)).mode & 0o777)
      await rename(source, destination)
    })
    await new FavouritesStore(directory).add(favourite)
    expect(modes).toEqual([0o600])
    expect(filesystem.writeFile).toHaveBeenLastCalledWith(`${path}.tmp`, expect.any(String), {
      flag: "wx",
      flush: true,
      mode: 0o600,
    })
    expect(filesystem.chmod).toHaveBeenCalledExactlyOnceWith(path, 0o600)
    expect((await filesystem.stat(path)).mode & 0o777).toBe(0o600)
    expect(JSON.parse(await filesystem.readFile(path, "utf8"))).toEqual(envelope([favourite]))
    await expect(filesystem.readFile(`${path}.tmp`)).rejects.toMatchObject({ code: "ENOENT" })
  })

  it.fails("D-cycle-16-2: surfaces failed chmod after successful rename, preserves prior bytes and permits a later mutation", async () => {
    const store = new FavouritesStore(directory)
    await store.add(favourite)
    const contents = await filesystem.readFile(path, "utf8")
    const failure = new Error("Chmod permission denied")
    vi.mocked(filesystem.chmod).mockRejectedValueOnce(failure)
    await expect(store.add({ login: "alpha" })).rejects.toBe(failure)
    expect(await filesystem.readFile(path, "utf8")).toBe(contents)
    await expect(filesystem.readFile(`${path}.tmp`)).rejects.toMatchObject({ code: "ENOENT" })
  })
})
