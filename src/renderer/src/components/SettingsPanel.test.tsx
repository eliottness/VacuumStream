import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { SettingsPanel } from "./SettingsPanel"

describe("settings account panel", () => {
  it("keeps the Twitch activation link and adds a scannable QR code", () => {
    // Given an active Twitch device authorization challenge
    const verificationUri = "https://www.twitch.tv/activate"

    // When the account panel renders the challenge
    const markup = renderToStaticMarkup(
      <SettingsPanel
        auth={{
          challenge: {
            expiresAt: "2026-09-17T21:00:00.000Z",
            flowId: "123e4567-e89b-12d3-a456-426614174000",
            intervalSeconds: 5,
            userCode: "ABCD-1234",
            verificationUri,
          },
          kind: "authorizing",
        }}
        onAuthChange={() => undefined}
        onSettingsChange={() => undefined}
        settings={{ clientId: "abcdefghijklmnopqrstuvwxyz1234", secureStorage: false }}
      />,
    )

    // Then another device can scan the QR while the original address remains visible
    expect(markup).toContain('aria-label="Scan Twitch activation QR code"')
    expect(markup).toContain(verificationUri)
    expect(markup).not.toContain("secure Linux keyring")
  })
})
