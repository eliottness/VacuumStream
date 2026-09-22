import * as filesystem from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
  videoId: "test-video",
}

describe("playback progress store — D-xc-performance-6", () => {
  let directory = ""

  beforeEach(async () => {
    vi.mocked(filesystem.readFile).mockReset()
    vi.mocked(filesystem.rename).mockReset()
    vi.mocked(filesystem.writeFile).mockReset()
    directory = await filesystem.mkdtemp(join(tmpdir(), "vacuumstream-progress-"))
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await filesystem.rm(directory, { recursive: true })
  })

  it.fails("D-xc-performance-6: coalesces rapid saves to the same video into fewer disk writes", async () => {
    // FIXED BEHAVIOR: Coalesce pending checkpoints per video, debounce ordinary samples,
    // and flush one latest checkpoint on leave/pause.
    // Currently BROKEN: Each save operation independently rereads JSON, rebuilds/sorts,
    // serializes, and performs flushed temp write/rename/chmod.

    const store = new PlaybackProgressStore(directory)

    // Reset mock after initial operations to focus on the rapid-save scenario
    vi.mocked(filesystem.readFile).mockClear()
    vi.mocked(filesystem.writeFile).mockClear()
    vi.mocked(filesystem.rename).mockClear()

    // Perform rapid saves to the same video (simulating seek/pause burst)
    const positions = [100, 150, 200, 250, 300]
    const saves = positions.map((position, index) =>
      store.save({
        ...bookmark,
        position,
        updatedAt: bookmark.updatedAt + index,
      }),
    )

    // Wait for all saves to complete
    await Promise.all(saves)

    // FIXED: With coalescing/debouncing, rapid saves to the same video should result
    // in a single writeFile call (only the final state is persisted).
    // CURRENTLY: Each save calls writeFile independently, so we get 5 calls.
    expect(vi.mocked(filesystem.writeFile)).toHaveBeenCalledTimes(1)

    // Verify the final state contains only the latest position
    const finalBookmark = await store.get(bookmark.videoId)
    expect(finalBookmark).toEqual({
      ...bookmark,
      position: 300,
      updatedAt: bookmark.updatedAt + 4,
    })
  })
})
