import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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

  it("uses the embedded Twitch Client ID when no settings were saved", async () => {
    // Given an empty application data directory
    directory = await mkdtemp(join(tmpdir(), "vacuumstream-settings-"))
    const store = new SettingsStore(directory)

    // When settings are loaded for the first time
    const settings = await store.load()

    // Then the project-owned public Client ID is available without setup
    expect(settings.clientId).toBe("eakftex39l79dzb7irvxxvr3i0o7d0")
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

  it("reads settings saved before the fullscreen preference existed as off", async () => {
    // Given a settings file from an earlier version
    directory = await mkdtemp(join(tmpdir(), "vacuumstream-settings-"))
    await writeFile(
      join(directory, "settings.json"),
      JSON.stringify({ clientId: "abcdefghijklmnopqrstuvwxyz1234" }),
    )

    // When it is loaded
    const settings = await new SettingsStore(directory).load()

    // Then the Client ID survives and streams do not start in fullscreen
    expect(settings).toEqual({
      clientId: "abcdefghijklmnopqrstuvwxyz1234",
      startStreamsFullscreen: false,
    })
  })

  it("keeps each setting when the other one is saved, even concurrently", async () => {
    // Given an empty application data directory
    directory = await mkdtemp(join(tmpdir(), "vacuumstream-settings-"))
    const store = new SettingsStore(directory)

    // When both settings are saved without waiting for each other
    await Promise.all([
      store.saveStartStreamsFullscreen(true),
      store.saveClientId("abcdefghijklmnopqrstuvwxyz1234"),
    ])

    // Then a fresh store reads both from disk
    expect(await new SettingsStore(directory).load()).toEqual({
      clientId: "abcdefghijklmnopqrstuvwxyz1234",
      startStreamsFullscreen: true,
    })
  })
})
