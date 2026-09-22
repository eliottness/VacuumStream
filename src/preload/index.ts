import { contextBridge, ipcRenderer } from "electron"
import { z } from "zod"
import { CHANNELS } from "../shared/channels"
import {
  AuthSnapshotSchema,
  CategoryCardSchema,
  ChannelCardSchema,
  ChatInputSessionSchema,
  DeviceChallengeSchema,
  FollowedChannelCardSchema,
  PageSchema,
  PlaybackBookmarkSchema,
  PlaybackProgressGetInputSchema,
  PlaybackProgressListSchema,
  PlaybackProgressRemoveInputSchema,
  PlaybackProgressSaveInputSchema,
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
    followedChannels: (input) =>
      ipcRenderer
        .invoke(CHANNELS.catalogFollowedChannels, input)
        .then((value) => PageSchema(FollowedChannelCardSchema).parse(value)),
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
  chatInput: {
    begin: (session) =>
      ipcRenderer
        .invoke(CHANNELS.chatInputBegin, ChatInputSessionSchema.parse(session))
        .then(() => undefined),
    end: (session) =>
      ipcRenderer
        .invoke(CHANNELS.chatInputEnd, ChatInputSessionSchema.parse(session))
        .then(() => undefined),
    onEscape: (listener) => {
      const onEscape = (_event: Electron.IpcRendererEvent, session: unknown): void => {
        listener(ChatInputSessionSchema.parse(session))
      }
      ipcRenderer.on(CHANNELS.chatInputEscape, onEscape)
      return () => {
        ipcRenderer.removeListener(CHANNELS.chatInputEscape, onEscape)
      }
    },
  },
  playbackProgress: {
    get: (videoId) =>
      ipcRenderer
        .invoke(CHANNELS.playbackProgressGet, PlaybackProgressGetInputSchema.parse(videoId))
        .then((value) => PlaybackBookmarkSchema.optional().parse(value)),
    list: () =>
      ipcRenderer
        .invoke(CHANNELS.playbackProgressList)
        .then((value) => PlaybackProgressListSchema.parse(value)),
    remove: (videoId) =>
      ipcRenderer
        .invoke(CHANNELS.playbackProgressRemove, PlaybackProgressRemoveInputSchema.parse(videoId))
        .then((value) => z.void().parse(value)),
    save: (bookmark) =>
      ipcRenderer
        .invoke(CHANNELS.playbackProgressSave, PlaybackProgressSaveInputSchema.parse(bookmark))
        .then((value) => z.void().parse(value)),
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
    activateEmbeddedPlayer: (audible) =>
      ipcRenderer
        .invoke(CHANNELS.systemActivateEmbeddedPlayer, audible)
        .then((value) => Boolean(value)),
    isSteamGameMode: () =>
      ipcRenderer.invoke(CHANNELS.systemIsSteamGameMode).then((value) => Boolean(value)),
    restoreShellFullscreen: () =>
      ipcRenderer.invoke(CHANNELS.systemRestoreShellFullscreen).then((value) => Boolean(value)),
    toggleFullscreen: () =>
      ipcRenderer.invoke(CHANNELS.systemToggleFullscreen).then((value) => Boolean(value)),
  },
} satisfies VacuumStreamApi

contextBridge.exposeInMainWorld("vacuumStream", api)
