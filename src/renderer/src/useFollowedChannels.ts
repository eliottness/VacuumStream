import { useCallback, useEffect, useRef, useState } from "react"
import type { CursorInput, LiveInput, Page } from "../../shared/contracts"
import type { Screen } from "./screen"

export type CatalogOperation = "more" | "refresh"

type Catalog<Item> = {
  readonly cursor: string | undefined
  readonly error: string
  readonly items: readonly Item[]
  // Retained on failure so Retry repeats the failed operation, not the stored cursor.
  readonly operation: CatalogOperation
  readonly status: "error" | "loading" | "ready"
}

const emptyCatalog = <Item>(): Catalog<Item> => ({
  cursor: undefined,
  error: "",
  items: [],
  operation: "refresh",
  status: "ready",
})

export const catalogRequests = {
  followed: (input: CursorInput) => window.vacuumStream.catalog.followed(input),
  followedChannels: (input: CursorInput) => window.vacuumStream.catalog.followedChannels(input),
  live: (input: LiveInput) => window.vacuumStream.catalog.live(input),
}

// The live shelves and directory share request arbitration; only their card shapes differ.
export const useStreamCatalog = <Item extends { readonly id: string }, Input extends CursorInput>(
  request: (input: Input) => Promise<Page<Item>>,
) => {
  const [catalog, setCatalog] = useState(emptyCatalog<Item>)
  const generation = useRef(0)
  const pending = useRef<CatalogOperation | undefined>(undefined)
  const invalidate = useCallback((): void => {
    generation.current += 1
    pending.current = undefined
  }, [])
  const reset = useCallback((): void => {
    invalidate()
    setCatalog(emptyCatalog<Item>())
  }, [invalidate])
  useEffect(() => invalidate, [invalidate])

  const load = useCallback(
    async (input: Input): Promise<void> => {
      const operation = input.after === undefined ? "refresh" : "more"
      if (pending.current === "refresh" || pending.current === operation) return
      const requestId = ++generation.current
      pending.current = operation
      setCatalog((current) => ({ ...current, error: "", operation, status: "loading" }))
      try {
        const page = await request(input)
        if (requestId !== generation.current) return
        setCatalog((current) => ({
          cursor: page.cursor,
          error: "",
          items: [
            ...new Map(
              [...(operation === "refresh" ? [] : current.items), ...page.items].map((item) => [
                item.id,
                item,
              ]),
            ).values(),
          ],
          operation,
          status: "ready",
        }))
      } catch (error) {
        if (requestId !== generation.current) return
        setCatalog((current) => ({
          ...current,
          error: error instanceof Error ? error.message : "An unexpected error occurred",
          status: "error",
        }))
      } finally {
        if (requestId === generation.current) pending.current = undefined
      }
    },
    [request],
  )
  return { catalog, invalidate, load, reset }
}

export const useFollowedChannels = (identity: string | undefined, screen: Screen) => {
  const { catalog, invalidate, load, reset } = useStreamCatalog(catalogRequests.followedChannels)
  const active =
    screen.kind === "browse" && screen.route === "following" && screen.followingMode === "all"

  useEffect(() => {
    if (identity === undefined || !active) return
    void load({ first: 20 })
    return invalidate
  }, [active, identity, invalidate, load])

  const loadOperation = (operation: CatalogOperation | "retry"): Promise<void> => {
    if (identity === undefined || !active) return Promise.resolve()
    const requested = operation === "retry" ? catalog.operation : operation
    if (requested === "more" && catalog.cursor === undefined) return Promise.resolve()
    return load({
      ...(requested === "more" ? { after: catalog.cursor } : {}),
      first: 20,
    })
  }

  return { catalog, invalidate, loadOperation, reset }
}
