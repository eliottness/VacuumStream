import { useCallback, useEffect, useRef, useState } from "react"
import type {
  AuthSnapshot,
  CategoryCard,
  ChannelCard,
  SettingsSnapshot,
  StreamCard,
  VideoCard,
} from "../../shared/contracts"
import type { RouteName } from "./components/Navigation"
import { PREVIEW_CATEGORIES } from "./demo-data"
import { type Screen, shouldNavigateHomeOnBack } from "./screen"
import { useContinueWatching } from "./useContinueWatching"
import {
  type CatalogOperation,
  catalogRequests,
  useFollowedChannels,
  useStreamCatalog,
} from "./useFollowedChannels"

type ShelfRoute = "following" | "home"
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "An unexpected error occurred"

const directChannel = (query: string): ChannelCard => ({
  category: "Twitch channel",
  displayName: query,
  id: `direct-${query}`,
  isLive: true,
  login: query,
  thumbnailUrl: `https://static-cdn.jtvnw.net/previews-ttv/live_user_${query}-640x360.jpg`,
  title: "Open in the official Twitch player",
})

export const useAppController = () => {
  const [auth, setAuth] = useState<AuthSnapshot>({ kind: "guest" })
  const [settings, setSettings] = useState<SettingsSnapshot>({ clientId: "", secureStorage: false })
  const [screen, setScreen] = useState<Screen>({ kind: "browse", route: "home" })
  const continueWatching = useContinueWatching(screen.kind === "browse" && screen.route === "home")
  const { invalidate: invalidateProgress } = continueWatching
  const {
    catalog: live,
    invalidate: invalidateLive,
    load: loadLive,
    reset: resetLive,
  } = useStreamCatalog(catalogRequests.live)
  const {
    catalog: followed,
    invalidate: invalidateFollowed,
    load: loadFollowed,
    reset: resetFollowed,
  } = useStreamCatalog(catalogRequests.followed)
  const {
    catalog: categoryCatalog,
    invalidate: invalidateCategory,
    load: loadCategory,
    reset: resetCategory,
  } = useStreamCatalog(catalogRequests.live)
  const [categories, setCategories] = useState<readonly CategoryCard[]>(PREVIEW_CATEGORIES)
  const [searchResults, setSearchResults] = useState<readonly ChannelCard[]>([])
  const [videoError, setVideoError] = useState("")
  const [videos, setVideos] = useState<readonly VideoCard[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const authEpoch = useRef(0)
  const catalogRequestEpoch = useRef(0)
  const currentScreen = useRef(screen)
  const currentIdentity = useRef<string | undefined>(undefined)
  const identity = auth.kind === "authenticated" ? auth.login : undefined
  const {
    catalog: followedChannels,
    invalidate: invalidateDirectory,
    loadOperation: loadDirectory,
    reset: resetDirectory,
  } = useFollowedChannels(identity, screen)
  const activeShelf =
    screen.kind === "browse" &&
    (screen.route === "home" || (screen.route === "following" && screen.followingMode !== "all"))
      ? screen.route
      : undefined
  const changeScreen = useCallback(
    (next: Screen): void => {
      const current = currentScreen.current
      if (
        next.kind === "browse" &&
        current.kind === "browse" &&
        next.route === current.route &&
        next.followingMode === current.followingMode
      )
        return
      catalogRequestEpoch.current += 1
      invalidateLive()
      invalidateFollowed()
      invalidateCategory()
      invalidateDirectory()
      invalidateProgress()
      setBusy(false)
      currentScreen.current = next
      setScreen(next)
    },
    [
      invalidateCategory,
      invalidateDirectory,
      invalidateFollowed,
      invalidateLive,
      invalidateProgress,
    ],
  )
  const navigate = useCallback(
    (route: RouteName): void => {
      changeScreen({ kind: "browse", route })
    },
    [changeScreen],
  )
  const navigateHome = useCallback((): void => {
    void window.vacuumStream.system.restoreShellFullscreen()
    navigate("home")
  }, [navigate])
  const updateAuth = useCallback(
    (nextAuth: AuthSnapshot): void => {
      const nextIdentity = nextAuth.kind === "authenticated" ? nextAuth.login : undefined
      if (nextIdentity !== currentIdentity.current) {
        currentIdentity.current = nextIdentity
        authEpoch.current += 1
        catalogRequestEpoch.current += 1
        resetLive()
        resetFollowed()
        resetCategory()
        resetDirectory()
        setCategories(PREVIEW_CATEGORIES)
        setSearchResults([])
        setVideoError("")
        setVideos([])
        setBusy(false)
        setNotice("")
        if (currentScreen.current.kind === "category" || currentScreen.current.kind === "videos")
          navigate("settings")
      }
      setAuth(nextAuth)
    },
    [navigate, resetCategory, resetDirectory, resetFollowed, resetLive],
  )

  useEffect(() => {
    let active = true
    void window.vacuumStream.settings
      .snapshot()
      .then((settingsSnapshot) => {
        if (active) setSettings(settingsSnapshot)
      })
      .catch((error: unknown) => {
        if (active) setNotice(errorMessage(error))
      })
    void window.vacuumStream.auth
      .snapshot()
      .then((authSnapshot) => {
        if (active) updateAuth(authSnapshot)
      })
      .catch((error: unknown) => {
        if (active) updateAuth({ kind: "error", message: errorMessage(error) })
      })
    return () => {
      active = false
      catalogRequestEpoch.current += 1
    }
  }, [updateAuth])

  useEffect(() => {
    if (auth.kind !== "authorizing") return
    const timer = window.setInterval(() => {
      void window.vacuumStream.auth
        .snapshot()
        .then(updateAuth)
        .catch((error: unknown) => {
          setNotice(`${errorMessage(error)}. Retrying Twitch sign-in`)
        })
    }, auth.challenge.intervalSeconds * 1000)
    return () => window.clearInterval(timer)
  }, [auth, updateAuth])

  useEffect(() => {
    if (identity === undefined || activeShelf === undefined) return
    void (activeShelf === "home" ? loadLive : loadFollowed)({ first: 20 })
    return activeShelf === "home" ? invalidateLive : invalidateFollowed
  }, [activeShelf, identity, invalidateFollowed, invalidateLive, loadFollowed, loadLive])

  useEffect(() => {
    if (identity === undefined) return
    const requestEpoch = authEpoch.current
    let active = true
    void window.vacuumStream.catalog
      .topCategories({ first: 20 })
      .then((page) => {
        if (active && requestEpoch === authEpoch.current) setCategories(page.items)
      })
      .catch((error: unknown) => {
        if (active && requestEpoch === authEpoch.current) setNotice(errorMessage(error))
      })
    return () => {
      active = false
    }
  }, [identity])

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) return
      const editingText = document.activeElement instanceof HTMLInputElement
      if (event.key === "/" && !editingText) {
        event.preventDefault()
        navigate("search")
      }
      if (event.key === "F10") {
        event.preventDefault()
        navigate("settings")
      }
      if (event.key === "Escape" && shouldNavigateHomeOnBack(screen)) {
        event.preventDefault()
        navigateHome()
      }
    }
    document.addEventListener("keydown", onShortcut)
    return () => document.removeEventListener("keydown", onShortcut)
  }, [navigate, navigateHome, screen])

  const loadShelf = (route: ShelfRoute, operation: CatalogOperation | "retry"): Promise<void> => {
    if (identity === undefined || activeShelf !== route) return Promise.resolve()
    const catalog = route === "home" ? live : followed
    const requested = operation === "retry" ? catalog.operation : operation
    if (requested === "more" && catalog.cursor === undefined) return Promise.resolve()
    return (route === "home" ? loadLive : loadFollowed)({
      ...(requested === "more" ? { after: catalog.cursor } : {}),
      first: 20,
    })
  }

  const showCategory = async (category: CategoryCard): Promise<void> => {
    if (auth.kind !== "authenticated") {
      setNotice("Sign in to browse live streams by category")
      navigate("settings")
      return
    }
    setNotice("")
    changeScreen({ id: category.id, kind: "category", name: category.name })
    resetCategory()
    await loadCategory({ first: 20, gameId: category.id })
  }

  const loadMoreCategory = async (): Promise<void> => {
    if (
      auth.kind !== "authenticated" ||
      screen.kind !== "category" ||
      categoryCatalog.status === "loading"
    ) {
      return
    }
    await loadCategory({
      ...(categoryCatalog.cursor === undefined ? {} : { after: categoryCatalog.cursor }),
      first: 20,
      gameId: screen.id,
    })
  }

  const openStream = (stream: StreamCard): void => {
    changeScreen({
      kind: "player",
      source: {
        channel: stream.userLogin,
        kind: "live",
        title: stream.title,
        userId: stream.userId,
      },
    })
  }

  const openChannel = (
    channel: Pick<ChannelCard, "displayName" | "id" | "login"> & { readonly title?: string },
  ): void => {
    changeScreen({
      kind: "player",
      source: {
        channel: channel.login,
        kind: "live",
        title: channel.title || channel.displayName,
        userId: channel.id.startsWith("direct-") ? "0" : channel.id,
      },
    })
  }

  const search = async (query: string): Promise<void> => {
    if (query === "") return
    setBusy(true)
    setNotice("")
    const requestEpoch = authEpoch.current
    const requestId = catalogRequestEpoch.current + 1
    catalogRequestEpoch.current = requestId
    try {
      if (auth.kind === "authenticated") {
        const items = (await window.vacuumStream.catalog.search({ first: 30, query })).items
        if (requestEpoch === authEpoch.current && requestId === catalogRequestEpoch.current) {
          setSearchResults(items)
        }
      } else if (/^[a-zA-Z0-9_]{1,25}$/.test(query)) {
        setSearchResults([directChannel(query.toLowerCase())])
      } else {
        setNotice("Signed-out search needs an exact Twitch channel name")
      }
    } catch (error) {
      if (requestEpoch === authEpoch.current && requestId === catalogRequestEpoch.current) {
        setNotice(errorMessage(error))
      }
    } finally {
      if (requestEpoch === authEpoch.current && requestId === catalogRequestEpoch.current) {
        setBusy(false)
      }
    }
  }

  const showPastBroadcasts = async (userId: string): Promise<void> => {
    if (auth.kind !== "authenticated" || userId === "0") {
      setNotice("Sign in to load past broadcasts for this channel")
      navigate("settings")
      return
    }
    changeScreen({ kind: "videos", userId })
    setVideoError("")
    setVideos([])
    setNotice("")
    setBusy(true)
    const requestEpoch = authEpoch.current
    const requestId = catalogRequestEpoch.current + 1
    catalogRequestEpoch.current = requestId
    try {
      const items = (await window.vacuumStream.catalog.videos({ first: 30, userId })).items
      if (requestEpoch === authEpoch.current && requestId === catalogRequestEpoch.current) {
        setVideos(items)
      }
    } catch (error) {
      if (requestEpoch === authEpoch.current && requestId === catalogRequestEpoch.current) {
        setVideoError(errorMessage(error))
      }
    } finally {
      if (requestEpoch === authEpoch.current && requestId === catalogRequestEpoch.current) {
        setBusy(false)
      }
    }
  }

  return {
    auth,
    busy,
    categories,
    categoryCatalog,
    continueWatching,
    followed,
    followedChannels,
    live,
    loadDirectory,
    loadMoreCategory,
    loadMoreShelf: (route: ShelfRoute) => loadShelf(route, "more"),
    navigate,
    navigateHome,
    notice,
    openChannel,
    openStream,
    refreshShelf: (route: ShelfRoute) => loadShelf(route, "refresh"),
    retryShelf: (route: ShelfRoute) => loadShelf(route, "retry"),
    screen,
    search,
    searchResults,
    setAuth: updateAuth,
    settings,
    showAllChannels: () => {
      if (identity === undefined) {
        setNotice("Sign in to see all the channels you follow")
        navigate("settings")
        return
      }
      changeScreen({ followingMode: "all", kind: "browse", route: "following" })
    },
    showCategory,
    showPastBroadcasts,
    updateSettings: (nextSettings: SettingsSnapshot, resetAuth: boolean) => {
      setSettings(nextSettings)
      if (resetAuth) updateAuth({ kind: "guest" })
    },
    videoError,
    videos,
    viewVideo: (video: Pick<VideoCard, "id" | "title" | "userId">) =>
      changeScreen({
        kind: "player",
        source: {
          kind: "video",
          title: video.title,
          userId: video.userId,
          videoId: video.id,
        },
      }),
  }
}
