import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import {
  type PlaybackBookmark,
  PlaybackBookmarkValueSchema,
  PlaybackProgressGetInputSchema,
  PlaybackProgressRemoveInputSchema,
  PlaybackProgressSaveInputSchema,
} from "../shared/contracts"

const MAX_BOOKMARKS = 100
const StoredProgressSchema = z.strictObject({
  bookmarks: z.preprocess(
    (input, context) => {
      // Zod strips this special key; reject it rather than silently dropping stored data.
      if (typeof input === "object" && input !== null && Object.hasOwn(input, "__proto__")) {
        context.addIssue({ code: "custom", message: "Invalid playback bookmark key" })
      }
      return input
    },
    z
      .record(PlaybackProgressGetInputSchema, PlaybackBookmarkValueSchema)
      .refine((bookmarks) => Object.keys(bookmarks).length <= MAX_BOOKMARKS, {
        message: "Too many playback bookmarks",
      }),
  ),
  version: z.literal(1),
})
type StoredProgress = z.infer<typeof StoredProgressSchema>

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

export class PlaybackProgressStore {
  readonly #directory: string
  readonly #path: string
  #operations: Promise<void> = Promise.resolve()

  public constructor(directory: string) {
    this.#directory = directory
    this.#path = join(directory, "playback-progress.json")
  }

  public async get(input: string): Promise<PlaybackBookmark | undefined> {
    return this.#serialize(async () => {
      const videoId = PlaybackProgressGetInputSchema.parse(input)
      const { bookmarks } = await this.#load()
      const bookmark = Object.hasOwn(bookmarks, videoId) ? bookmarks[videoId] : undefined
      return bookmark === undefined ? undefined : { ...bookmark, videoId }
    })
  }

  public async save(input: PlaybackBookmark): Promise<void> {
    await this.#serialize(async () => {
      const { videoId, ...bookmark } = PlaybackProgressSaveInputSchema.parse(input)
      const progress = await this.#load()
      const bookmarks = new Map(Object.entries(progress.bookmarks))
      bookmarks.set(videoId, bookmark)
      const newest = [...bookmarks].sort(([, left], [, right]) => right.updatedAt - left.updatedAt)
      await this.#persist({
        bookmarks: Object.fromEntries(newest.slice(0, MAX_BOOKMARKS)),
        version: 1,
      })
    })
  }

  public async remove(input: string): Promise<void> {
    await this.#serialize(async () => {
      const videoId = PlaybackProgressRemoveInputSchema.parse(input)
      const progress = await this.#load()
      if (!Object.hasOwn(progress.bookmarks, videoId)) return
      delete progress.bookmarks[videoId]
      await this.#persist(progress)
    })
  }

  async #load(): Promise<StoredProgress> {
    let contents: string
    try {
      contents = await readFile(this.#path, "utf8")
    } catch (error) {
      if (isMissingFile(error)) return { bookmarks: {}, version: 1 }
      throw error
    }
    return StoredProgressSchema.parse(JSON.parse(contents))
  }

  async #persist(input: StoredProgress): Promise<void> {
    const progress = StoredProgressSchema.parse(input)
    await mkdir(this.#directory, { mode: 0o700, recursive: true })
    const temporaryPath = `${this.#path}.tmp`
    await rm(temporaryPath, { force: true })
    try {
      await writeFile(temporaryPath, `${JSON.stringify(progress)}\n`, {
        flag: "wx",
        flush: true,
        mode: 0o600,
      })
      await rename(temporaryPath, this.#path)
      await chmod(this.#path, 0o600)
    } catch (error) {
      await rm(temporaryPath, { force: true })
      throw error
    }
  }

  async #serialize<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#operations.then(operation, operation)
    this.#operations = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}
