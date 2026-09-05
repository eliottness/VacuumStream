import { z } from "zod"

export const ClientIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{20,64}$/)
  .brand<"ClientId">()

export const CursorInputSchema = z.object({
  after: z.string().max(512).optional(),
  first: z.number().int().min(1).max(100).default(20),
})

export const SearchInputSchema = CursorInputSchema.extend({
  query: z.string().trim().min(1).max(100),
})

export const VideosInputSchema = CursorInputSchema.extend({
  userId: z.string().min(1).max(64),
})

export const StreamCardSchema = z.object({
  category: z.string(),
  id: z.string(),
  startedAt: z.string(),
  tags: z.array(z.string()),
  thumbnailUrl: z.url(),
  title: z.string(),
  userId: z.string(),
  userLogin: z.string(),
  userName: z.string(),
  viewerCount: z.number().int().nonnegative(),
})

export const CategoryCardSchema = z.object({
  boxArtUrl: z.url(),
  id: z.string(),
  name: z.string(),
})

export const ChannelCardSchema = z.object({
  category: z.string(),
  displayName: z.string(),
  id: z.string(),
  isLive: z.boolean(),
  login: z.string(),
  thumbnailUrl: z.url(),
  title: z.string(),
})

export const VideoCardSchema = z.object({
  createdAt: z.string(),
  duration: z.string(),
  id: z.string(),
  publishedAt: z.string(),
  thumbnailUrl: z.url(),
  title: z.string(),
  userId: z.string(),
  userLogin: z.string(),
  userName: z.string(),
  viewCount: z.number().int().nonnegative(),
})

export const PageSchema = <Item extends z.ZodType>(item: Item) =>
  z
    .object({
      cursor: z.string().optional(),
      items: z.array(item),
    })
    .transform((page) => ({ cursor: page.cursor, items: page.items }))

export const DeviceChallengeSchema = z.object({
  expiresAt: z.string(),
  flowId: z.string(),
  intervalSeconds: z.number().int().positive(),
  userCode: z.string(),
  verificationUri: z.url(),
})

const GuestAuthSchema = z.object({ kind: z.literal("guest") })
const AuthorizingAuthSchema = z.object({
  challenge: DeviceChallengeSchema,
  kind: z.literal("authorizing"),
})
const AuthenticatedAuthSchema = z.object({
  displayName: z.string(),
  kind: z.literal("authenticated"),
  login: z.string(),
})
const AuthErrorSchema = z.object({
  kind: z.literal("error"),
  message: z.string(),
})

export const AuthSnapshotSchema = z.discriminatedUnion("kind", [
  GuestAuthSchema,
  AuthorizingAuthSchema,
  AuthenticatedAuthSchema,
  AuthErrorSchema,
])

export const SettingsSnapshotSchema = z.object({
  clientId: z.string(),
  secureStorage: z.boolean(),
})

export type AuthSnapshot = z.infer<typeof AuthSnapshotSchema>
export type CategoryCard = z.infer<typeof CategoryCardSchema>
export type ChannelCard = z.infer<typeof ChannelCardSchema>
export type ClientId = z.infer<typeof ClientIdSchema>
export type CursorInput = z.input<typeof CursorInputSchema>
export type DeviceChallenge = z.infer<typeof DeviceChallengeSchema>
export type Page<Item> = {
  readonly cursor: string | undefined
  readonly items: readonly Item[]
}
export type SearchInput = z.input<typeof SearchInputSchema>
export type SettingsSnapshot = z.infer<typeof SettingsSnapshotSchema>
export type StreamCard = z.infer<typeof StreamCardSchema>
export type VideoCard = z.infer<typeof VideoCardSchema>
export type VideosInput = z.input<typeof VideosInputSchema>

export interface VacuumStreamApi {
  readonly auth: {
    readonly begin: () => Promise<DeviceChallenge>
    readonly logout: () => Promise<void>
    readonly openActivation: (flowId: string) => Promise<void>
    readonly snapshot: () => Promise<AuthSnapshot>
  }
  readonly catalog: {
    readonly followed: (input: CursorInput) => Promise<Page<StreamCard>>
    readonly live: (input: CursorInput) => Promise<Page<StreamCard>>
    readonly search: (input: SearchInput) => Promise<Page<ChannelCard>>
    readonly topCategories: (input: CursorInput) => Promise<Page<CategoryCard>>
    readonly videos: (input: VideosInput) => Promise<Page<VideoCard>>
  }
  readonly settings: {
    readonly saveClientId: (clientId: string) => Promise<SettingsSnapshot>
    readonly snapshot: () => Promise<SettingsSnapshot>
  }
  readonly system: {
    readonly isSteamGameMode: () => Promise<boolean>
    readonly toggleFullscreen: () => Promise<boolean>
  }
}
