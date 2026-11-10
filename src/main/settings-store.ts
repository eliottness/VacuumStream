import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type ClientId, ClientIdSchema } from "../shared/contracts"

// Files written before a preference existed simply lack it.
const StoredSettingsSchema = z.object({
  clientId: ClientIdSchema,
  startStreamsFullscreen: z.boolean().default(false),
})
const DEFAULT_CLIENT_ID = ClientIdSchema.parse("eakftex39l79dzb7irvxxvr3i0o7d0")

export type PublicSettings = {
  readonly clientId: ClientId | ""
  readonly startStreamsFullscreen: boolean
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

export class SettingsStore {
  readonly #directory: string
  readonly #path: string
  // Each save rewrites the whole file, so saves run one at a time over the latest contents.
  #updates: Promise<unknown> = Promise.resolve()

  public constructor(directory: string) {
    this.#directory = directory
    this.#path = join(directory, "settings.json")
  }

  public async load(): Promise<PublicSettings> {
    let contents: string
    try {
      contents = await readFile(this.#path, "utf8")
    } catch (error) {
      if (isMissingFile(error)) {
        return { clientId: DEFAULT_CLIENT_ID, startStreamsFullscreen: false }
      }
      throw error
    }
    return StoredSettingsSchema.parse(JSON.parse(contents))
  }

  public async saveClientId(input: string): Promise<PublicSettings> {
    const clientId = ClientIdSchema.parse(input)
    return this.#update((settings) => ({ ...settings, clientId }))
  }

  public saveStartStreamsFullscreen(enabled: boolean): Promise<PublicSettings> {
    return this.#update((settings) => ({ ...settings, startStreamsFullscreen: enabled }))
  }

  #update(change: (settings: PublicSettings) => PublicSettings): Promise<PublicSettings> {
    const update = this.#updates.then(async () => this.#save(change(await this.load())))
    this.#updates = update.catch(() => undefined)
    return update
  }

  async #save(settings: PublicSettings): Promise<PublicSettings> {
    await mkdir(this.#directory, { recursive: true })
    const temporaryPath = `${this.#path}.tmp`
    await writeFile(temporaryPath, JSON.stringify(settings, undefined, 2), { mode: 0o600 })
    await rename(temporaryPath, this.#path)
    return settings
  }
}
