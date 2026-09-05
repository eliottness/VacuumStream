import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { SettingsStore } from "./settings-store"

describe("settings store", () => {
  let directory = ""

  afterEach(async () => {
    if (directory !== "") {
      await rm(directory, { recursive: true })
    }
  })

  it("persists a valid public Twitch Client ID atomically", async () => {
    // Given an empty application data directory
    directory = await mkdtemp(join(tmpdir(), "vacuumstream-settings-"))
    const store = new SettingsStore(directory)

    // When a valid public Client ID is saved
    const settings = await store.saveClientId("abcdefghijklmnopqrstuvwxyz1234")

    // Then the normalized setting is returned and persisted without a secret
    expect(settings.clientId).toBe("abcdefghijklmnopqrstuvwxyz1234")
    expect(await readFile(join(directory, "settings.json"), "utf8")).toContain(
      "abcdefghijklmnopqrstuvwxyz1234",
    )
  })

  it("rejects an invalid Client ID before writing", async () => {
    // Given an empty application data directory
    directory = await mkdtemp(join(tmpdir(), "vacuumstream-settings-"))
    const store = new SettingsStore(directory)

    // When an invalid setting crosses the persistence boundary
    const save = (): Promise<unknown> => store.saveClientId("not valid")

    // Then no invalid setting is accepted
    await expect(save()).rejects.toThrow()
  })
})
