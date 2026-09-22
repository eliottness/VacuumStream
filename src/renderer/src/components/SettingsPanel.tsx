import { CheckCircleIcon, CopyIcon, SignInIcon, SignOutIcon } from "@phosphor-icons/react"
import { QRCodeSVG } from "qrcode.react"
import { type ComponentProps, useEffect, useRef, useState } from "react"
import type { AuthSnapshot, SettingsSnapshot } from "../../../shared/contracts"

type SettingsPanelProps = {
  readonly auth: AuthSnapshot
  readonly onAccountRequest: () => () => boolean
  readonly onAuthChange: (auth: AuthSnapshot) => void
  readonly onSettingsChange: (settings: SettingsSnapshot, resetAuth: boolean) => void
  readonly settings: SettingsSnapshot
}

type SubmitHandler = NonNullable<ComponentProps<"form">["onSubmit"]>

export const settingsAccountFocusId = (auth: AuthSnapshot): string =>
  auth.kind === "authenticated"
    ? "settings-logout"
    : auth.kind === "authorizing"
      ? "settings-open-activation"
      : "settings-sign-in"

const errorMessage = (error: unknown): string =>
  error instanceof Error && error.message.includes("id.twitch.tv")
    ? "Twitch could not start device sign-in. Check the Client ID and network connection"
    : error instanceof Error
      ? error.message
      : "An unexpected error occurred"

export const SettingsPanel = ({
  auth,
  onAccountRequest,
  onAuthChange,
  onSettingsChange,
  settings,
}: SettingsPanelProps) => {
  const [clientId, setClientId] = useState(settings.clientId)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const pending = useRef(false)
  const accountFocusId = settingsAccountFocusId(auth)
  const needsClientId = (auth.kind === "guest" || auth.kind === "error") && settings.clientId === ""
  const AccountIcon =
    auth.kind === "authenticated"
      ? SignOutIcon
      : auth.kind === "authorizing"
        ? CopyIcon
        : SignInIcon

  useEffect(() => setClientId(settings.clientId), [settings.clientId])

  const save: SubmitHandler = async (event) => {
    event.preventDefault()
    if (pending.current) return
    if (!/^[a-z0-9]{20,64}$/.test(clientId.trim())) {
      setError("Client IDs use 20–64 lowercase letters and numbers")
      return
    }
    pending.current = true
    const isCurrent = onAccountRequest()
    setBusy(true)
    setError("")
    try {
      const nextSettings = await window.vacuumStream.settings.saveClientId(clientId)
      if (isCurrent()) onSettingsChange(nextSettings, nextSettings.clientId !== settings.clientId)
    } catch (caught) {
      if (isCurrent()) setError(errorMessage(caught))
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  const activateAccount = async (): Promise<void> => {
    // aria-disabled keeps controller focus; the ref also blocks clicks before React commits.
    if (pending.current || needsClientId) return
    pending.current = true
    // App owns currentness across routes; this mount still owns its synchronous click guard.
    const isCurrent = onAccountRequest()
    setBusy(true)
    setError("")
    try {
      if (auth.kind === "authenticated") {
        await window.vacuumStream.auth.logout()
        if (isCurrent()) onAuthChange({ kind: "guest" })
      } else if (auth.kind === "authorizing") {
        await window.vacuumStream.auth.openActivation(auth.challenge.flowId)
      } else {
        const challenge = await window.vacuumStream.auth.begin()
        if (isCurrent()) onAuthChange({ challenge, kind: "authorizing" })
      }
    } catch (caught) {
      if (isCurrent()) {
        setError(
          auth.kind === "authorizing"
            ? "Could not open a browser. Enter the code manually at the address shown below"
            : errorMessage(caught),
        )
      }
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <main className="settings-panel" id="main-content" tabIndex={-1}>
      <header className="page-heading">
        <span>Account and application</span>
        <h1>Settings</h1>
        <p>Sign in to Twitch to unlock personalized discovery.</p>
      </header>

      <section aria-labelledby="account-heading" className="settings-card">
        <div>
          <h2 id="account-heading">Twitch account</h2>
          <p>
            Device sign-in grants only permission to read followed channels. Playback remains in
            Twitch's official player.
          </p>
        </div>
        <div className={auth.kind === "authorizing" ? "device-code" : "account-status"}>
          {auth.kind === "authenticated" ? <span>Signed in as {auth.displayName}</span> : null}
          {auth.kind === "authorizing" ? (
            <div className="device-code__challenge">
              <div>
                <span>Enter this code at Twitch</span>
                <strong>{auth.challenge.userCode}</strong>
                <span>{auth.challenge.verificationUri}</span>
              </div>
              <div
                aria-label="Scan Twitch activation QR code"
                className="device-code__qr"
                role="img"
              >
                <QRCodeSVG
                  level="M"
                  marginSize={4}
                  size={192}
                  title="Twitch activation link"
                  value={auth.challenge.verificationUri}
                />
              </div>
            </div>
          ) : null}
          <button
            aria-busy={busy}
            aria-disabled={busy || needsClientId}
            className="primary-button"
            data-focus-down="settings-client-id"
            data-focus-id={accountFocusId}
            data-focus-left="nav-settings"
            data-focus-up="nav-settings"
            data-focusable="true"
            onClick={activateAccount}
            type="button"
          >
            <AccountIcon aria-hidden="true" />
            {auth.kind === "authenticated"
              ? "Sign out"
              : auth.kind === "authorizing"
                ? "Open Twitch activation"
                : "Sign in on another device"}
          </button>
        </div>
      </section>

      <section aria-labelledby="developer-app-heading" className="settings-card">
        <div>
          <h2 id="developer-app-heading">Twitch application</h2>
          <p>
            A public Client ID is built in. Only replace it when using your own Twitch application.
            VacuumStream never asks for or stores a Client Secret.
          </p>
        </div>
        <form onSubmit={save}>
          <label htmlFor="client-id">Public Client ID</label>
          <div className="field-row">
            <input
              autoComplete="off"
              data-focus-down="settings-save"
              data-focus-id="settings-client-id"
              data-focus-up={accountFocusId}
              data-focusable="true"
              id="client-id"
              onChange={(event) => setClientId(event.currentTarget.value)}
              placeholder="abcdefghijklmnopqrstuvwxyz1234"
              spellCheck="false"
              value={clientId}
            />
            <button
              data-focus-id="settings-save"
              data-focus-left="nav-settings"
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
      {error !== "" ? (
        <p className="error-message" role="alert">
          {error}
        </p>
      ) : null}
      {auth.kind === "error" ? (
        <p className="error-message" role="alert">
          {auth.message}
        </p>
      ) : null}
    </main>
  )
}
