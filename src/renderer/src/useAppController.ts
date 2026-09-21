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
import { PREVIEW_CATEGORIES, PREVIEW_STREAMS } from "./demo-data"
import { type Screen, shouldNavigateHomeOnBack } from "./screen"

type CategoryCatalog = {
  readonly cursor: string | undefined
  readonly error: string
  readonly items: readonly StreamCard[]
  readonly status: "error" | "loading" | "ready"
}

const EMPTY_CATEGORY: CategoryCatalog = {
  cursor: undefined,
  error: "",
  items: [],
  status: "ready",
}

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
  const [live, setLive] = useState<readonly StreamCard[]>(PREVIEW_STREAMS)
  const [followed, setFollowed] = useState<readonly StreamCard[]>([])
  const [categories, setCategories] = useState<readonly CategoryCard[]>(PREVIEW_CATEGORIES)
  const [categoryCatalog, setCategoryCatalog] = useState<CategoryCatalog>(EMPTY_CATEGORY)
  const [searchResults, setSearchResults] = useState<readonly ChannelCard[]>([])
  const [videos, setVideos] = useState<readonly VideoCard[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState("")
  const authEpoch = useRef(0)
  const catalogRequestEpoch = useRef(0)
  const navigate = useCallback((route: RouteName): void => {
    catalogRequestEpoch.current += 1
    setScreen({ kind: "browse", route })
  }, [])
  const navigateHome = useCallback((): void => {
    void window.vacuumStream.system.restoreShellFullscreen()
    navigate("home")
  }, [navigate])
  const updateAuth = useCallback((nextAuth: AuthSnapshot): void => {
    authEpoch.current += 1
    catalogRequestEpoch.current += 1
    if (nextAuth.kind !== "authenticated") {
      setFollowed([])
      setSearchResults([])
      setVideos([])
      setCategoryCatalog(EMPTY_CATEGORY)
      setScreen((current) =>
        current.kind === "category" ? { kind: "browse", route: "settings" } : current,
      )
    }
    setAuth(nextAuth)
  }, [])

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
    if (auth.kind !== "authenticated") return
    let active = true
    setBusy(true)
    void Promise.all([
      window.vacuumStream.catalog.live({ first: 20 }),
      window.vacuumStream.catalog.followed({ first: 20 }),
      window.vacuumStream.catalog.topCategories({ first: 20 }),
    ])
      .then(([livePage, followedPage, categoryPage]) => {
        if (active) {
          setLive(livePage.items)
          setFollowed(followedPage.items)
          setCategories(categoryPage.items)
        }
      })
      .catch((error: unknown) => {
        if (active) setNotice(errorMessage(error))
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [auth.kind])

  useEffect(() => {
    const onShortcut = (event: KeyboardEvent): void => {
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

  const loadCategoryPage = async (gameId: string, after?: string): Promise<void> => {
    const requestEpoch = authEpoch.current
    const requestId = catalogRequestEpoch.current + 1
    catalogRequestEpoch.current = requestId
    const isCurrent = (): boolean =>
      requestEpoch === authEpoch.current && requestId === catalogRequestEpoch.current
    setCategoryCatalog((current) => ({ ...current, error: "", status: "loading" }))
    try {
      const page = await window.vacuumStream.catalog.live({
        ...(after === undefined ? {} : { after }),
        first: 20,
        gameId,
      })
      if (!isCurrent()) return
      setCategoryCatalog((current) => ({
        cursor: page.cursor,
        error: "",
        items: [
          ...new Map(
            [...(after === undefined ? [] : current.items), ...page.items].map((stream) => [
              stream.id,
              stream,
            ]),
          ).values(),
        ],
        status: "ready",
      }))
    } catch (error) {
      if (!isCurrent()) return
      setCategoryCatalog((current) => ({
        ...current,
        error: errorMessage(error),
        status: "error",
      }))
    }
  }

  const showCategory = async (category: CategoryCard): Promise<void> => {
    if (auth.kind !== "authenticated") {
      setNotice("Sign in to browse live streams by category")
      navigate("settings")
      return
    }
    setNotice("")
    setCategoryCatalog(EMPTY_CATEGORY)
    setScreen({ id: category.id, kind: "category", name: category.name })
    await loadCategoryPage(category.id)
  }

  const loadMoreCategory = async (): Promise<void> => {
    if (
      auth.kind !== "authenticated" ||
      screen.kind !== "category" ||
      categoryCatalog.status === "loading"
    ) {
      return
    }
    await loadCategoryPage(screen.id, categoryCatalog.cursor)
  }

  const openStream = (stream: StreamCard): void => {
    catalogRequestEpoch.current += 1
    setScreen({
      kind: "player",
      source: {
        channel: stream.userLogin,
        kind: "live",
        title: stream.title,
        userId: stream.userId,
      },
    })
  }

  const openChannel = (channel: ChannelCard): void => {
    setScreen({
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
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const showPastBroadcasts = async (userId: string): Promise<void> => {
    if (auth.kind !== "authenticated" || userId === "0") {
      setNotice("Sign in to load past broadcasts for this channel")
      setScreen({ kind: "browse", route: "settings" })
      return
    }
    setBusy(true)
    const requestEpoch = authEpoch.current
    const requestId = catalogRequestEpoch.current + 1
    catalogRequestEpoch.current = requestId
    try {
      const items = (await window.vacuumStream.catalog.videos({ first: 30, userId })).items
      if (requestEpoch === authEpoch.current && requestId === catalogRequestEpoch.current) {
        setVideos(items)
        setScreen({ kind: "videos" })
      }
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return {
    auth,
    busy,
    categories,
    categoryCatalog,
    followed,
    live,
    loadMoreCategory,
    navigate,
    navigateHome,
    notice,
    openChannel,
    openStream,
    screen,
    search,
    searchResults,
    setAuth: updateAuth,
    settings,
    showCategory,
    showPastBroadcasts,
    updateSettings: (nextSettings: SettingsSnapshot, resetAuth: boolean) => {
      setSettings(nextSettings)
      if (resetAuth) updateAuth({ kind: "guest" })
    },
    videos,
    viewVideo: (video: VideoCard) =>
      setScreen({
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
