import { X509Certificate } from "node:crypto"
import { join } from "node:path"
import { app, BrowserWindow, dialog, safeStorage, session } from "electron"
import { type StaticHttpsServer, startStaticHttpsServer } from "./https-server"
import { registerIpc } from "./ipc"
import { SettingsStore } from "./settings-store"
import { TokenVault } from "./token-vault"
import { TwitchService } from "./twitch-service"

let staticServer: StaticHttpsServer | undefined

const isTwitchPlayerOrigin = (value: string): boolean =>
  URL.canParse(value) && new URL(value).origin === "https://player.twitch.tv"

const createWindow = async (): Promise<void> => {
  const { SteamGamepadUI: steamGamepadUi, SteamOS: steamOs } = process.env
  const runningInSteamGameMode = steamOs === "1" && steamGamepadUi === "1"
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: "#0e0e10",
    fullscreen: runningInSteamGameMode,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(import.meta.dirname, "../preload/index.cjs"),
      sandbox: true,
    },
  })

  const { ELECTRON_RENDERER_URL: developmentRendererUrl } = process.env
  const rendererUrl = app.isPackaged ? undefined : developmentRendererUrl
  let rendererOrigin: string
  if (rendererUrl !== undefined) {
    rendererOrigin = new URL(rendererUrl).origin
  } else {
    const certificatesPath = app.isPackaged
      ? join(process.resourcesPath, "certs")
      : join(app.getAppPath(), "resources/certs")
    staticServer = await startStaticHttpsServer({
      assetsPath: join(app.getAppPath(), "out/renderer"),
      certificatePath: join(certificatesPath, "localhost-cert.pem"),
      keyPath: join(certificatesPath, "localhost-key.pem"),
    })
    rendererOrigin = staticServer.origin

    app.on("certificate-error", (event, webContents, url, error, certificate, callback) => {
      const trustsCertificate =
        webContents.id === mainWindow.webContents.id &&
        URL.canParse(url) &&
        new URL(url).origin === staticServer?.origin &&
        error === "net::ERR_CERT_AUTHORITY_INVALID" &&
        new X509Certificate(certificate.data).fingerprint256 ===
          staticServer?.certificateFingerprint

      if (trustsCertificate) {
        event.preventDefault()
        callback(true)
        return
      }
      callback(false)
    })
  }

  const tokenVault = new TokenVault(app.getPath("userData"), {
    backend: () => safeStorage.getSelectedStorageBackend(),
    decrypt: (value) => safeStorage.decryptString(value),
    encrypt: (value) => safeStorage.encryptString(value),
    isAvailable: () => safeStorage.isEncryptionAvailable(),
  })
  registerIpc({
    mainWindow,
    rendererOrigin,
    runningInSteamGameMode,
    twitch: new TwitchService(new SettingsStore(app.getPath("userData")), tokenVault),
  })

  session.defaultSession.setPermissionCheckHandler(
    (webContents, permission, requestingOrigin) =>
      webContents !== null &&
      webContents.id === mainWindow.webContents.id &&
      permission === "fullscreen" &&
      isTwitchPlayerOrigin(requestingOrigin),
  )
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, details) => {
      callback(
        webContents.id === mainWindow.webContents.id &&
          permission === "fullscreen" &&
          isTwitchPlayerOrigin(details.requestingUrl),
      )
    },
  )

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const permitsNavigation = URL.canParse(url) && new URL(url).origin === rendererOrigin
    if (!permitsNavigation) {
      event.preventDefault()
    }
  })

  await mainWindow.loadURL(rendererUrl ?? rendererOrigin)
}

app
  .whenReady()
  .then(createWindow)
  .catch(async (error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown startup failure"
    dialog.showErrorBox("VacuumStream could not start", message)
    await staticServer?.close()
    app.exit(1)
  })

app.on("window-all-closed", () => {
  app.quit()
})

app.on("will-quit", () => {
  void staticServer?.close()
})
