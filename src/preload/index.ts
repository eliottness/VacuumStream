import { contextBridge, ipcRenderer } from "electron"
import { CHANNELS } from "../shared/channels"
import {
  AuthSnapshotSchema,
  CategoryCardSchema,
  ChannelCardSchema,
  DeviceChallengeSchema,
  PageSchema,
  SettingsSnapshotSchema,
  StreamCardSchema,
  type VacuumStreamApi,
  VideoCardSchema,
} from "../shared/contracts"

const api = {
  auth: {
    begin: () =>
      ipcRenderer.invoke(CHANNELS.authBegin).then((value) => DeviceChallengeSchema.parse(value)),
    logout: () => ipcRenderer.invoke(CHANNELS.authLogout).then(() => undefined),
    openActivation: (flowId) =>
      ipcRenderer.invoke(CHANNELS.authOpenActivation, flowId).then(() => undefined),
    snapshot: () =>
      ipcRenderer.invoke(CHANNELS.authSnapshot).then((value) => AuthSnapshotSchema.parse(value)),
  },
  catalog: {
    followed: (input) =>
      ipcRenderer
        .invoke(CHANNELS.catalogFollowed, input)
        .then((value) => PageSchema(StreamCardSchema).parse(value)),
    live: (input) =>
      ipcRenderer
        .invoke(CHANNELS.catalogLive, input)
        .then((value) => PageSchema(StreamCardSchema).parse(value)),
    search: (input) =>
      ipcRenderer
        .invoke(CHANNELS.catalogSearch, input)
        .then((value) => PageSchema(ChannelCardSchema).parse(value)),
    topCategories: (input) =>
      ipcRenderer
        .invoke(CHANNELS.catalogTopCategories, input)
        .then((value) => PageSchema(CategoryCardSchema).parse(value)),
    videos: (input) =>
      ipcRenderer
        .invoke(CHANNELS.catalogVideos, input)
        .then((value) => PageSchema(VideoCardSchema).parse(value)),
  },
  settings: {
    saveClientId: (clientId) =>
      ipcRenderer
        .invoke(CHANNELS.settingsSaveClientId, clientId)
        .then((value) => SettingsSnapshotSchema.parse(value)),
    snapshot: () =>
      ipcRenderer
        .invoke(CHANNELS.settingsSnapshot)
        .then((value) => SettingsSnapshotSchema.parse(value)),
  },
  system: {
    activateEmbeddedPlayer: () =>
      ipcRenderer.invoke(CHANNELS.systemActivateEmbeddedPlayer).then((value) => Boolean(value)),
    isSteamGameMode: () =>
      ipcRenderer.invoke(CHANNELS.systemIsSteamGameMode).then((value) => Boolean(value)),
    restoreShellFullscreen: () =>
      ipcRenderer.invoke(CHANNELS.systemRestoreShellFullscreen).then((value) => Boolean(value)),
    toggleFullscreen: () =>
      ipcRenderer.invoke(CHANNELS.systemToggleFullscreen).then((value) => Boolean(value)),
  },
} satisfies VacuumStreamApi

contextBridge.exposeInMainWorld("vacuumStream", api)
