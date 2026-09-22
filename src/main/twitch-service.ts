import ky from "ky"
import type {
  AuthSnapshot,
  CategoryCard,
  ChannelCard,
  CursorInput,
  DeviceChallenge,
  FollowedChannelCard,
  LiveInput,
  Page,
  SearchInput,
  SettingsSnapshot,
  StreamCard,
  VideoCard,
  VideosInput,
} from "../shared/contracts"
import {
  CursorInputSchema,
  LiveInputSchema,
  SearchInputSchema,
  VideosInputSchema,
} from "../shared/contracts"
import type { SettingsStore } from "./settings-store"
import type { TokenVault } from "./token-vault"
import { TwitchAuth } from "./twitch-auth"
import { ConfigurationError } from "./twitch-errors"
import {
  createLiveSearchParams,
  createVideoSearchParams,
  shouldRefreshResponse,
} from "./twitch-requests"
import {
  mergeStreamProfiles,
  parseCategoriesResponse,
  parseChannelsResponse,
  parseFollowedChannelsResponse,
  parseStreamsResponse,
  parseUsersResponse,
  parseVideosResponse,
} from "./twitch-schemas"
import type { TwitchCredentials } from "./twitch-session"

type HelixSearch = URLSearchParams | Readonly<Record<string, string | number | undefined>>
type ProfileLoader = () => Promise<ReadonlyMap<string, string>>

export const enrichStreamProfiles = async (
  streams: Page<StreamCard>,
  loadProfiles: ProfileLoader,
): Promise<Page<StreamCard>> => {
  try {
    return mergeStreamProfiles(streams, await loadProfiles())
  } catch (error) {
    if (error instanceof Error) return streams
    throw error
  }
}

export class TwitchService {
  readonly #auth: TwitchAuth

  public constructor(settings: SettingsStore, vault: TokenVault) {
    this.#auth = new TwitchAuth(settings, vault)
  }

  public settingsSnapshot(): Promise<SettingsSnapshot> {
    return this.#auth.settingsSnapshot()
  }

  public saveClientId(clientId: string): Promise<SettingsSnapshot> {
    return this.#auth.saveClientId(clientId)
  }

  public beginAuthorization(): Promise<DeviceChallenge> {
    return this.#auth.begin()
  }

  public authSnapshot(): Promise<AuthSnapshot> {
    return this.#auth.snapshot()
  }

  public logout(): Promise<void> {
    return this.#auth.logout()
  }

  public activationUrl(flowId: string): string {
    return this.#auth.activationUrl(flowId)
  }

  public async live(input: LiveInput): Promise<Page<StreamCard>> {
    return this.#streams("streams", createLiveSearchParams(LiveInputSchema.parse(input)))
  }

  public async followed(input: CursorInput): Promise<Page<StreamCard>> {
    const parsed = CursorInputSchema.parse(input)
    const { identity } = await this.#auth.credentials()
    return this.#streams("streams/followed", { ...parsed, user_id: identity.user_id })
  }

  public async followedChannels(input: CursorInput): Promise<Page<FollowedChannelCard>> {
    const parsed = CursorInputSchema.parse(input)
    const { identity } = await this.#auth.credentials()
    const page = await this.#helix(
      "channels/followed",
      { ...parsed, user_id: identity.user_id },
      parseFollowedChannelsResponse,
    )
    if (page.items.length === 0) return page

    const streamSearch = new URLSearchParams({ first: "100" })
    const userSearch = new URLSearchParams()
    for (const channel of page.items) {
      streamSearch.append("user_id", channel.id)
      userSearch.append("id", channel.id)
    }
    const [streams, profiles] = await Promise.all([
      this.#helix("streams", streamSearch, parseStreamsResponse),
      this.#helix("users", userSearch, parseUsersResponse).catch((error: unknown) => {
        // Avatars are optional; the separate live-status request must still succeed.
        if (error instanceof Error) return new Map<string, string>()
        throw error
      }),
    ])
    const liveIds = new Set(streams.items.map((stream) => stream.userId))
    return {
      cursor: page.cursor,
      items: page.items.map((channel) => ({
        ...channel,
        isLive: liveIds.has(channel.id),
        profileImageUrl: profiles.get(channel.id),
      })),
    }
  }

  public async topCategories(input: CursorInput): Promise<Page<CategoryCard>> {
    return this.#helix("games/top", CursorInputSchema.parse(input), parseCategoriesResponse)
  }

  public async search(input: SearchInput): Promise<Page<ChannelCard>> {
    const parsed = SearchInputSchema.parse(input)
    return this.#helix("search/channels", parsed, parseChannelsResponse)
  }

  public async videos(input: VideosInput): Promise<Page<VideoCard>> {
    const parsed = VideosInputSchema.parse(input)
    return this.#helix("videos", createVideoSearchParams(parsed), parseVideosResponse)
  }

  async #streams(path: string, search: HelixSearch): Promise<Page<StreamCard>> {
    const streams = await this.#helix(path, search, parseStreamsResponse)
    if (streams.items.length === 0) return streams

    const userSearch = new URLSearchParams()
    for (const userId of new Set(streams.items.map((stream) => stream.userId))) {
      userSearch.append("id", userId)
    }
    return enrichStreamProfiles(streams, () => this.#helix("users", userSearch, parseUsersResponse))
  }

  async #helix<Result>(
    path: string,
    search: HelixSearch,
    parse: (input: unknown) => Result,
  ): Promise<Result> {
    let credentials = await this.#auth.credentials()
    let response = await this.#request(path, search, credentials)
    if (shouldRefreshResponse(response.status)) {
      credentials = await this.#auth.refreshCredentials()
      response = await this.#request(path, search, credentials)
    }
    if (!response.ok) {
      throw new ConfigurationError(`Twitch catalog request failed (${response.status})`)
    }
    const payload: unknown = await response.json()
    return parse(payload)
  }

  #request(path: string, search: HelixSearch, credentials: TwitchCredentials): Promise<Response> {
    return ky.get(`https://api.twitch.tv/helix/${path}`, {
      headers: {
        Authorization: `Bearer ${credentials.token.accessToken}`,
        "Client-Id": credentials.clientId,
      },
      searchParams: search,
      throwHttpErrors: false,
      timeout: 15_000,
    })
  }
}
