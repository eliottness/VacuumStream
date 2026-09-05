import { CheckCircleIcon, CopyIcon, SignInIcon, SignOutIcon } from "@phosphor-icons/react"
import { type ComponentProps, useEffect, useState } from "react"
import type { AuthSnapshot, SettingsSnapshot } from "../../../shared/contracts"

type SettingsPanelProps = {
  readonly auth: AuthSnapshot
  readonly onAuthChange: (auth: AuthSnapshot) => void
  readonly onSettingsChange: (settings: SettingsSnapshot, resetAuth: boolean) => void
  readonly settings: SettingsSnapshot
}

type SubmitHandler = NonNullable<ComponentProps<"form">["onSubmit"]>

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message.includes("id.twitch.tv")
    ? "Twitch could not start device sign-in. Check the Client ID and network connection"
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred"

export const SettingsPanel = ({
  auth,
  onAuthChange,
  onSettingsChange,
  settings,
}: SettingsPanelProps) => {
  const [clientId, setClientId] = useState(settings.clientId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => setClientId(settings.clientId), [settings.clientId])

  const save: SubmitHandler = async (event) => {
    event.preventDefault()
    if (!/^[a-z0-9]{20,64}$/.test(clientId.trim())) {
      setError("Client IDs use 20–64 lowercase letters and numbers")
      return
    }
    setBusy(true)
    setError("")
    try {
      const nextSettings = await window.vacuumStream.settings.saveClientId(clientId)
      onSettingsChange(nextSettings, nextSettings.clientId !== settings.clientId)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const begin = async (): Promise<void> => {
    setBusy(true)
    setError("")
    try {
      const challenge = await window.vacuumStream.auth.begin()
      onAuthChange({ challenge, kind: "authorizing" })
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const logout = async (): Promise<void> => {
    setError("")
    onAuthChange({ kind: "guest" })
    try {
      await window.vacuumStream.auth.logout()
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  const openActivation = async (): Promise<void> => {
    if (auth.kind !== "authorizing") return
    setError("")
    try {
      await window.vacuumStream.auth.openActivation(auth.challenge.flowId)
    } catch {
      setError("Could not open a browser. Enter the code manually at the address shown below")
    }
  }

  return (
    <main className="settings-panel" id="main-content" tabIndex={-1}>
      <header className="page-heading">
        <span>Account and application</span>
        <h1>Settings</h1>
        <p>Connect a public Twitch application to unlock personalized discovery.</p>
      </header>

      <section className="settings-card" aria-labelledby="developer-app-heading">
        <div>
          <h2 id="developer-app-heading">Twitch application</h2>
          <p>
            Create a public application in the Twitch Developer Console, then paste its Client ID.
            VacuumStream never asks for or stores a Client Secret.
          </p>
        </div>
        <form onSubmit={save}>
          <label htmlFor="client-id">Public Client ID</label>
          <div className="field-row">
            <input
              autoComplete="off"
              data-focus-id="settings-client-id"
              data-focus-down="settings-save"
              data-focusable="true"
              id="client-id"
              onChange={(event) => setClientId(event.currentTarget.value)}
              placeholder="abcdefghijklmnopqrstuvwxyz1234"
              spellCheck="false"
              value={clientId}
            />
            <button
              data-focus-id="settings-save"
              data-focus-up="settings-client-id"
              data-focusable="true"
              disabled={busy}
              type="submit"
            >
              <CheckCircleIcon aria-hidden="true" />
              Save
            </button>
          </div>
        </form>
      </section>

      <section className="settings-card" aria-labelledby="account-heading">
        <div>
          <h2 id="account-heading">Twitch account</h2>
          <p>
            Device sign-in grants only permission to read followed channels. Playback remains in
            Twitch's official player.
          </p>
        </div>
        {auth.kind === "authenticated" ? (
          <div className="account-status">
            <span>Signed in as {auth.displayName}</span>
            <button
              data-focus-id="settings-logout"
              data-focusable="true"
              onClick={logout}
              type="button"
            >
              <SignOutIcon aria-hidden="true" />
              Sign out
            </button>
          </div>
        ) : null}
        {auth.kind === "guest" || auth.kind === "error" ? (
          <button
            className="primary-button"
            data-focus-id="settings-sign-in"
            data-focus-up="settings-save"
            data-focusable="true"
            disabled={busy || settings.clientId === ""}
            onClick={begin}
            type="button"
          >
            <SignInIcon aria-hidden="true" />
            Sign in on another device
          </button>
        ) : null}
        {auth.kind === "authorizing" ? (
          <div className="device-code">
            <span>Enter this code at Twitch</span>
            <strong>{auth.challenge.userCode}</strong>
            <span>{auth.challenge.verificationUri}</span>
            <button
              data-focus-id="settings-open-activation"
              data-focus-up="settings-save"
              data-focusable="true"
              onClick={() => void openActivation()}
              type="button"
            >
              <CopyIcon aria-hidden="true" />
              Open Twitch activation
            </button>
          </div>
        ) : null}
        {!settings.secureStorage ? (
          <p className="warning">
            A secure Linux keyring is unavailable. Your sign-in will stay in memory and expire when
            VacuumStream closes.
          </p>
        ) : null}
      </section>
      {error !== "" ? <p className="error-message">{error}</p> : null}
      {auth.kind === "error" ? <p className="error-message">{auth.message}</p> : null}
    </main>
  )
}
