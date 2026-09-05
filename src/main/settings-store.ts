import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"
import { type ClientId, ClientIdSchema } from "../shared/contracts"

const StoredSettingsSchema = z.object({ clientId: ClientIdSchema })

export type PublicSettings = {
  readonly clientId: ClientId | ""
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

export class SettingsStore {
  readonly #directory: string
  readonly #path: string

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
        return { clientId: "" }
      }
      throw error
    }
    return StoredSettingsSchema.parse(JSON.parse(contents))
  }

  public async saveClientId(input: string): Promise<PublicSettings> {
    const settings = { clientId: ClientIdSchema.parse(input) }
    await mkdir(this.#directory, { recursive: true })
    const temporaryPath = `${this.#path}.tmp`
    await writeFile(temporaryPath, JSON.stringify(settings, undefined, 2), { mode: 0o600 })
    await rename(temporaryPath, this.#path)
    return settings
  }
}
