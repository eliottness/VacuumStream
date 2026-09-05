import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { type SecureStorageAdapter, TokenVault } from "./token-vault"

const token = {
  accessToken: "access",
  expiresAt: "2026-09-05T20:00:00.000Z",
  refreshToken: "refresh",
}

describe("token vault", () => {
  let directory = ""

  afterEach(async () => {
    if (directory !== "") {
      await rm(directory, { recursive: true })
    }
  })

  it("round-trips tokens when a secure Linux backend is available", async () => {
    // Given an application data directory and an encrypted storage adapter
    directory = await mkdtemp(join(tmpdir(), "vacuumstream-token-"))
    const adapter: SecureStorageAdapter = {
      backend: () => "gnome_libsecret",
      decrypt: (value) => value.toString("utf8"),
      encrypt: (value) => Buffer.from(value),
      isAvailable: () => true,
    }
    const vault = new TokenVault(directory, adapter)

    // When a rotating OAuth token is saved
    await vault.save(token)

    // Then it can be recovered through the same secure boundary
    await expect(vault.load()).resolves.toEqual(token)
  })

  it("keeps tokens session-only when Electron reports plaintext storage", async () => {
    // Given a Linux backend that would only obfuscate plaintext
    directory = await mkdtemp(join(tmpdir(), "vacuumstream-token-"))
    const adapter: SecureStorageAdapter = {
      backend: () => "basic_text",
      decrypt: (value) => value.toString("utf8"),
      encrypt: (value) => Buffer.from(value),
      isAvailable: () => true,
    }
    const vault = new TokenVault(directory, adapter)

    // When a token is saved for the current session
    await vault.save(token)

    // Then it remains available without being written as reusable plaintext
    expect(vault.isPersistent).toBe(false)
    await expect(vault.load()).resolves.toEqual(token)
  })

  it("does not let an in-flight load restore a cleared token", async () => {
    // Given an encrypted token persisted by a previous vault instance
    directory = await mkdtemp(join(tmpdir(), "vacuumstream-token-"))
    const adapter: SecureStorageAdapter = {
      backend: () => "gnome_libsecret",
      decrypt: (value) => value.toString("utf8"),
      encrypt: (value) => Buffer.from(value),
      isAvailable: () => true,
    }
    await new TokenVault(directory, adapter).save(token)
    const vault = new TokenVault(directory, adapter)

    // When disk loading and logout clearing overlap
    const loading = vault.load()
    const clearing = vault.clear()
    await Promise.allSettled([loading, clearing])

    // Then later reads cannot observe a resurrected session token
    await expect(vault.load()).resolves.toBeUndefined()
  })
})
