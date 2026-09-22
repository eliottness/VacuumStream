import { z } from "zod"

export const ChatInputActionSchema = z.enum(["next", "previous", "activate"])
export type ChatInputAction = z.infer<typeof ChatInputActionSchema>
export const ChatInputFailureSchema = z.literal("transport")
export const ChatInputSessionSchema = z.uuid()
export const ChatInputPressSchema = z.tuple([ChatInputSessionSchema, ChatInputActionSchema])

export const ClientIdSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9]{20,64}$/)
  .brand<"ClientId">()

export const CursorInputSchema = z.object({
  after: z.string().max(512).optional(),
  first: z.number().int().min(1).max(100).default(20),
})

export const FAVOURITES_LIMIT = 50
export const FAVOURITES_LIMIT_ERROR = "FAVOURITES_LIMIT_REACHED"

export const FavouriteLoginSchema = z
  .string()
  .min(1)
  .max(25)
  .regex(/^[a-zA-Z0-9_]{1,25}$/)
  .toLowerCase()
export const FavouriteSchema = z.strictObject({
  login: FavouriteLoginSchema,
  userId: z
    .string()
    .min(1)
    .max(64)
    .refine((userId) => !userId.startsWith("direct-"), {
      message: "A favourite userId must not be a synthetic channel id",
    })
    .optional(),
})
export const FavouritesAddInputSchema = FavouriteSchema
export const FavouritesListSchema = z
  .array(FavouriteSchema)
  .max(FAVOURITES_LIMIT)
  .refine((entries) => new Set(entries.map((entry) => entry.login)).size === entries.length, {
    message: "Duplicate favourite login",
  })
export const FavouritesRemoveInputSchema = FavouriteLoginSchema

export const LiveInputSchema = CursorInputSchema.extend({
  gameId: z.string().min(1).max(64).optional(),
})

export const PlaybackProgressGetInputSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((videoId) => videoId !== "__proto__", { message: "Invalid video id" })
export const PlaybackProgressRemoveInputSchema = PlaybackProgressGetInputSchema

export const PlaybackBookmarkValueSchema = z
  .strictObject({
    details: z
      .strictObject({
        title: z.string().min(1).max(300),
        userId: z.string().min(1).max(64),
      })
      .optional(),
    duration: z.number().positive(),
    position: z.number().nonnegative(),
    updatedAt: z.number().int().nonnegative(),
  })
  .refine((bookmark) => bookmark.position <= bookmark.duration, {
    message: "Playback position must not exceed duration",
    path: ["position"],
  })

export const PlaybackBookmarkSchema = PlaybackBookmarkValueSchema.safeExtend({
  videoId: PlaybackProgressGetInputSchema,
})
export const PlaybackProgressListSchema = z.array(PlaybackBookmarkSchema).max(100)
export const PlaybackProgressSaveInputSchema = PlaybackBookmarkSchema

export const SearchInputSchema = CursorInputSchema.extend({
  query: z.string().trim().min(1).max(100),
})

export const VideosInputSchema = CursorInputSchema.extend({
  userId: z.string().min(1).max(64),
})

export const StreamCardSchema = z.object({
  category: z.string(),
  id: z.string(),
  profileImageUrl: z.url().optional(),
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

export const FollowedChannelCardSchema = z.object({
  displayName: z.string(),
  id: z.string(),
  isLive: z.boolean(),
  login: z.string(),
  profileImageUrl: z.url().optional(),
})

export const VideoCardSchema = z.object({
  createdAt: z.string(),
  duration: z.string(),
  id: z.string(),
  publishedAt: z.string(),
  thumbnailUrl: z.url().optional(),
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
export type Favourite = z.infer<typeof FavouriteSchema>
export type FollowedChannelCard = z.infer<typeof FollowedChannelCardSchema>
export type LiveInput = z.input<typeof LiveInputSchema>
export type Page<Item> = {
  readonly cursor: string | undefined
  readonly items: readonly Item[]
}
export type PlaybackBookmark = z.infer<typeof PlaybackBookmarkSchema>
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
    readonly followedChannels: (input: CursorInput) => Promise<Page<FollowedChannelCard>>
    readonly live: (input: LiveInput) => Promise<Page<StreamCard>>
    readonly search: (input: SearchInput) => Promise<Page<ChannelCard>>
    readonly topCategories: (input: CursorInput) => Promise<Page<CategoryCard>>
    readonly videos: (input: VideosInput) => Promise<Page<VideoCard>>
  }
  readonly chatInput: {
    readonly begin: (session: string) => Promise<void>
    readonly end: (session: string) => Promise<void>
    readonly onEscape: (
      listener: (session: string, failure?: z.infer<typeof ChatInputFailureSchema>) => void,
    ) => () => void
    readonly press: (session: string, action: ChatInputAction) => Promise<void>
  }
  readonly favourites: {
    readonly add: (entry: Favourite) => Promise<readonly Favourite[]>
    readonly list: () => Promise<readonly Favourite[]>
    readonly remove: (login: string) => Promise<readonly Favourite[]>
  }
  readonly playbackProgress: {
    readonly get: (videoId: string) => Promise<PlaybackBookmark | undefined>
    readonly list: () => Promise<readonly PlaybackBookmark[]>
    readonly remove: (videoId: string) => Promise<void>
    readonly save: (bookmark: PlaybackBookmark) => Promise<void>
  }
  readonly settings: {
    readonly saveClientId: (clientId: string) => Promise<SettingsSnapshot>
    readonly snapshot: () => Promise<SettingsSnapshot>
  }
  readonly system: {
    readonly activateEmbeddedPlayer: (audible: boolean) => Promise<boolean>
    readonly isSteamGameMode: () => Promise<boolean>
    readonly restoreShellFullscreen: () => Promise<boolean>
    readonly toggleFullscreen: () => Promise<boolean>
  }
}
