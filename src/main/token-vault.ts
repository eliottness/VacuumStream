import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { z } from "zod"

const StoredTokenSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string(),
  refreshToken: z.string().min(1),
})

export type StoredToken = z.infer<typeof StoredTokenSchema>

export interface SecureStorageAdapter {
  readonly backend: () => string
  readonly decrypt: (value: Buffer) => string
  readonly encrypt: (value: string) => Buffer
  readonly isAvailable: () => boolean
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT"

export class TokenVault {
  readonly #adapter: SecureStorageAdapter
  readonly #directory: string
  readonly #path: string
  #operations: Promise<void> = Promise.resolve()
  #sessionToken: StoredToken | undefined

  public constructor(directory: string, adapter: SecureStorageAdapter) {
    this.#adapter = adapter
    this.#directory = directory
    this.#path = join(directory, "oauth-token.bin")
  }

  public get isPersistent(): boolean {
    return this.#adapter.isAvailable() && this.#adapter.backend() !== "basic_text"
  }

  public async load(): Promise<StoredToken | undefined> {
    return this.#serialize(async () => {
      if (this.#sessionToken !== undefined) {
        return this.#sessionToken
      }
      if (!this.isPersistent) {
        return undefined
      }

      let encrypted: Buffer
      try {
        encrypted = await readFile(this.#path)
      } catch (error) {
        if (isMissingFile(error)) {
          return undefined
        }
        throw error
      }

      this.#sessionToken = StoredTokenSchema.parse(JSON.parse(this.#adapter.decrypt(encrypted)))
      return this.#sessionToken
    })
  }

  public async save(token: StoredToken): Promise<void> {
    await this.#serialize(async () => {
      this.#sessionToken = StoredTokenSchema.parse(token)
      if (!this.isPersistent) {
        return
      }

      await mkdir(this.#directory, { recursive: true })
      const temporaryPath = `${this.#path}.tmp`
      const encrypted = this.#adapter.encrypt(JSON.stringify(this.#sessionToken))
      await writeFile(temporaryPath, encrypted, { mode: 0o600 })
      await rename(temporaryPath, this.#path)
    })
  }

  public async clear(): Promise<void> {
    await this.#serialize(async () => {
      this.#sessionToken = undefined
      await rm(this.#path, { force: true })
    })
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
