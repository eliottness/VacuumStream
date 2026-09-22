import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import {
  FAVOURITES_LIMIT,
  FAVOURITES_LIMIT_ERROR,
  type Favourite,
  FavouritesAddInputSchema,
  FavouritesListSchema,
  FavouritesRemoveInputSchema,
} from "../shared/contracts"

const StoredFavouritesSchema = z.strictObject({
  favourites: FavouritesListSchema,
  version: z.literal(1),
})
type StoredFavourites = z.infer<typeof StoredFavouritesSchema>

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

const sortFavourites = (entries: readonly Favourite[]): Favourite[] =>
  [...entries].sort((left, right) =>
    left.login < right.login ? -1 : left.login > right.login ? 1 : 0,
  )

export class FavouritesLimitError extends Error {
  public readonly code = FAVOURITES_LIMIT_ERROR

  public constructor() {
    // Electron preserves the message, not custom error properties, across invoke.
    super(`${FAVOURITES_LIMIT_ERROR}: At most ${FAVOURITES_LIMIT} channels can be favourited`)
    this.name = "FavouritesLimitError"
  }
}

export class FavouritesStore {
  readonly #directory: string
  readonly #path: string
  #operations: Promise<void> = Promise.resolve()

  public constructor(directory: string) {
    this.#directory = directory
    this.#path = join(directory, "favourites.json")
  }

  public async add(input: Favourite): Promise<readonly Favourite[]> {
    return this.#serialize(async () => {
      const entry = FavouritesAddInputSchema.parse(input)
      const { favourites } = await this.#load()
      const entries = new Map(favourites.map((favourite) => [favourite.login, favourite]))
      if (!entries.has(entry.login) && entries.size === FAVOURITES_LIMIT) {
        throw new FavouritesLimitError()
      }
      const existing = entries.get(entry.login)
      entries.set(entry.login, {
        ...existing,
        login: entry.login,
        ...(entry.userId === undefined ? {} : { userId: entry.userId }),
      })
      const committed = sortFavourites([...entries.values()])
      await this.#persist({ favourites: committed, version: 1 })
      return committed
    })
  }

  public async list(): Promise<readonly Favourite[]> {
    return this.#serialize(async () => sortFavourites((await this.#load()).favourites))
  }

  public async remove(input: string): Promise<readonly Favourite[]> {
    return this.#serialize(async () => {
      const login = FavouritesRemoveInputSchema.parse(input)
      const { favourites } = await this.#load()
      const committed = sortFavourites(favourites.filter((entry) => entry.login !== login))
      if (committed.length !== favourites.length) {
        await this.#persist({ favourites: committed, version: 1 })
      }
      return committed
    })
  }

  async #load(): Promise<StoredFavourites> {
    let contents: string
    try {
      contents = await readFile(this.#path, "utf8")
    } catch (error) {
      if (isMissingFile(error)) return { favourites: [], version: 1 }
      throw error
    }
    return StoredFavouritesSchema.parse(JSON.parse(contents))
  }

  async #persist(input: StoredFavourites): Promise<void> {
    const favourites = StoredFavouritesSchema.parse(input)
    await mkdir(this.#directory, { mode: 0o700, recursive: true })
    const temporaryPath = `${this.#path}.tmp`
    await rm(temporaryPath, { force: true })
    try {
      await writeFile(temporaryPath, `${JSON.stringify(favourites)}\n`, {
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
