import { z } from "zod"
import type {
  CategoryCard,
  ChannelCard,
  DeviceChallenge,
  Page,
  StreamCard,
  VideoCard,
} from "../shared/contracts"

const PaginationSchema = z.object({ cursor: z.string().optional() })

const HelixStreamSchema = z.object({
  game_name: z.string(),
  id: z.string(),
  started_at: z.string(),
  tags: z.array(z.string()).default([]),
  thumbnail_url: z.url(),
  title: z.string(),
  user_id: z.string(),
  user_login: z.string(),
  user_name: z.string(),
  viewer_count: z.number().int().nonnegative(),
})

const HelixCategorySchema = z.object({
  box_art_url: z.url(),
  id: z.string(),
  name: z.string(),
})

const HelixChannelSchema = z.object({
  broadcaster_language: z.string(),
  broadcaster_login: z.string(),
  display_name: z.string(),
  game_name: z.string(),
  id: z.string(),
  is_live: z.boolean(),
  tags: z.array(z.string()).default([]),
  thumbnail_url: z.url(),
  title: z.string(),
})

const HelixVideoSchema = z.object({
  created_at: z.string(),
  duration: z.string(),
  id: z.string(),
  published_at: z.string(),
  thumbnail_url: z.string(),
  title: z.string(),
  user_id: z.string(),
  user_login: z.string(),
  user_name: z.string(),
  view_count: z.number().int().nonnegative(),
})

const DeviceCodeResponseSchema = z.object({
  device_code: z.string(),
  expires_in: z.number().int().positive(),
  interval: z.number().int().positive(),
  user_code: z.string(),
  verification_uri: z.url(),
})

export const TokenResponseSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().int().positive(),
  refresh_token: z.string(),
  scope: z.array(z.string()),
  token_type: z.string(),
})

export const TokenErrorSchema = z.object({
  message: z.string(),
  status: z.number().int(),
})

export const ValidationResponseSchema = z.object({
  client_id: z.string(),
  expires_in: z.number().int().nonnegative(),
  login: z.string(),
  scopes: z.array(z.string()),
  user_id: z.string(),
})

export type DeviceCodeResponse = z.infer<typeof DeviceCodeResponseSchema>
export type TokenResponse = z.infer<typeof TokenResponseSchema>
export type ValidationResponse = z.infer<typeof ValidationResponseSchema>

const mapPage = <ApiItem, Item>(
  data: readonly ApiItem[],
  cursor: string | undefined,
  mapItem: (item: ApiItem) => Item,
): Page<Item> => {
  const items = data.map(mapItem)
  return { cursor, items }
}

export const parseStreamsResponse = (input: unknown): Page<StreamCard> => {
  const response = z
    .object({ data: z.array(HelixStreamSchema), pagination: PaginationSchema })
    .parse(input)
  return mapPage(response.data, response.pagination.cursor, (stream) => ({
    category: stream.game_name,
    id: stream.id,
    startedAt: stream.started_at,
    tags: stream.tags,
    thumbnailUrl: stream.thumbnail_url.replace("{width}", "640").replace("{height}", "360"),
    title: stream.title,
    userId: stream.user_id,
    userLogin: stream.user_login,
    userName: stream.user_name,
    viewerCount: stream.viewer_count,
  }))
}

export const parseCategoriesResponse = (input: unknown): Page<CategoryCard> => {
  const response = z
    .object({ data: z.array(HelixCategorySchema), pagination: PaginationSchema })
    .parse(input)
  return mapPage(response.data, response.pagination.cursor, (category) => ({
    boxArtUrl: category.box_art_url.replace("{width}", "384").replace("{height}", "512"),
    id: category.id,
    name: category.name,
  }))
}

export const parseChannelsResponse = (input: unknown): Page<ChannelCard> => {
  const response = z
    .object({ data: z.array(HelixChannelSchema), pagination: PaginationSchema })
    .parse(input)
  return mapPage(response.data, response.pagination.cursor, (channel) => ({
    category: channel.game_name,
    displayName: channel.display_name,
    id: channel.id,
    isLive: channel.is_live,
    login: channel.broadcaster_login,
    thumbnailUrl: channel.thumbnail_url,
    title: channel.title,
  }))
}

export const parseVideosResponse = (input: unknown): Page<VideoCard> => {
  const response = z
    .object({ data: z.array(HelixVideoSchema), pagination: PaginationSchema })
    .parse(input)
  return mapPage(response.data, response.pagination.cursor, (video) => ({
    createdAt: video.created_at,
    duration: video.duration,
    id: video.id,
    publishedAt: video.published_at,
    thumbnailUrl: video.thumbnail_url.replace("%{width}", "640").replace("%{height}", "360"),
    title: video.title,
    userId: video.user_id,
    userLogin: video.user_login,
    userName: video.user_name,
    viewCount: video.view_count,
  }))
}

export const parseDeviceCodeResponse = (input: unknown): DeviceCodeResponse =>
  DeviceCodeResponseSchema.parse(input)

export const toDeviceChallenge = (
  response: DeviceCodeResponse,
  flowId: string,
  now: Date,
): DeviceChallenge => ({
  expiresAt: new Date(now.getTime() + response.expires_in * 1000).toISOString(),
  flowId,
  intervalSeconds: response.interval,
  userCode: response.user_code,
  verificationUri: response.verification_uri,
})
