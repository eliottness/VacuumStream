import * as filesystem from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { Favourite } from "../shared/contracts"
import { FavouritesStore } from "./favourites-store"

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return { ...actual, chmod: vi.fn(actual.chmod) }
})

const envelope = (favourites: readonly Favourite[]) => ({ favourites, version: 1 })

describe("favourites store defect regressions", () => {
  let directory = ""
  let path = ""

  beforeEach(async () => {
    vi.mocked(filesystem.chmod).mockReset()
    directory = await filesystem.mkdtemp(join(tmpdir(), "vacuumstream-favourites-"))
    path = join(directory, "favourites.json")
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await filesystem.rm(directory, { force: true, recursive: true })
  })

  it.fails("D-cycle-16-1 never reports a failed write after rename has committed new bytes", async () => {
    const priorContents = `${JSON.stringify(envelope([]))}\n`
    const favourite = { login: "streamer", userId: "123" }
    const permissionFailure = new Error("Permission hardening failed")
    await filesystem.writeFile(path, priorContents)
    vi.mocked(filesystem.chmod).mockRejectedValueOnce(permissionFailure)

    const outcome = await new FavouritesStore(directory).add(favourite).then(
      () => "committed" as const,
      () => "rejected" as const,
    )
    const contents = await filesystem.readFile(path, "utf8")

    if (outcome === "rejected") {
      expect(contents).toBe(priorContents)
    } else {
      expect(JSON.parse(contents)).toEqual(envelope([favourite]))
    }
  })
})
