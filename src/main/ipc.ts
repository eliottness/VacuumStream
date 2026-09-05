import { type BrowserWindow, type IpcMainInvokeEvent, ipcMain, shell } from "electron"
import { z } from "zod"
import { CHANNELS } from "../shared/channels"
import { CursorInputSchema, SearchInputSchema, VideosInputSchema } from "../shared/contracts"
import type { TwitchService } from "./twitch-service"

type IpcOptions = {
  readonly mainWindow: BrowserWindow
  readonly rendererOrigin: string
  readonly runningInSteamGameMode: boolean
  readonly twitch: TwitchService
}

export class InvalidIpcSenderError extends Error {
  public constructor() {
    super("IPC call rejected from an unexpected frame")
    this.name = "InvalidIpcSenderError"
  }
}

export const registerIpc = (options: IpcOptions): void => {
  const authorize = (event: IpcMainInvokeEvent): void => {
    const senderFrame = event.senderFrame
    if (
      senderFrame === null ||
      event.sender.id !== options.mainWindow.webContents.id ||
      senderFrame !== options.mainWindow.webContents.mainFrame ||
      !URL.canParse(senderFrame.url) ||
      new URL(senderFrame.url).origin !== options.rendererOrigin
    ) {
      throw new InvalidIpcSenderError()
    }
  }

  ipcMain.handle(CHANNELS.settingsSnapshot, async (event) => {
    authorize(event)
    return options.twitch.settingsSnapshot()
  })
  ipcMain.handle(CHANNELS.settingsSaveClientId, async (event, input: unknown) => {
    authorize(event)
    return options.twitch.saveClientId(z.string().parse(input))
  })
  ipcMain.handle(CHANNELS.authSnapshot, async (event) => {
    authorize(event)
    return options.twitch.authSnapshot()
  })
  ipcMain.handle(CHANNELS.authBegin, async (event) => {
    authorize(event)
    return options.twitch.beginAuthorization()
  })
  ipcMain.handle(CHANNELS.authOpenActivation, async (event, input: unknown) => {
    authorize(event)
    await shell.openExternal(options.twitch.activationUrl(z.uuid().parse(input)))
  })
  ipcMain.handle(CHANNELS.authLogout, async (event) => {
    authorize(event)
    await options.twitch.logout()
  })
  ipcMain.handle(CHANNELS.catalogLive, async (event, input: unknown) => {
    authorize(event)
    return options.twitch.live(CursorInputSchema.parse(input))
  })
  ipcMain.handle(CHANNELS.catalogFollowed, async (event, input: unknown) => {
    authorize(event)
    return options.twitch.followed(CursorInputSchema.parse(input))
  })
  ipcMain.handle(CHANNELS.catalogTopCategories, async (event, input: unknown) => {
    authorize(event)
    return options.twitch.topCategories(CursorInputSchema.parse(input))
  })
  ipcMain.handle(CHANNELS.catalogSearch, async (event, input: unknown) => {
    authorize(event)
    return options.twitch.search(SearchInputSchema.parse(input))
  })
  ipcMain.handle(CHANNELS.catalogVideos, async (event, input: unknown) => {
    authorize(event)
    return options.twitch.videos(VideosInputSchema.parse(input))
  })
  ipcMain.handle(CHANNELS.systemIsSteamGameMode, (event) => {
    authorize(event)
    return options.runningInSteamGameMode
  })
  ipcMain.handle(CHANNELS.systemToggleFullscreen, (event) => {
    authorize(event)
    const fullscreen = !options.mainWindow.isFullScreen()
    options.mainWindow.setFullScreen(fullscreen)
    return fullscreen
  })
}
