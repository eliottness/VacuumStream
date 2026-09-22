import { useCallback, useEffect, useRef, useState } from "react"
import { FAVOURITES_LIMIT, FAVOURITES_LIMIT_ERROR, type Favourite } from "../../shared/contracts"

type Mutation = {
  readonly login: string
  readonly operation: "add" | "remove"
}

export type FavouritesState = {
  readonly error: string
  readonly items: readonly Favourite[]
  readonly mutationError: (Mutation & { readonly message: string }) | undefined
  readonly pending: Mutation | undefined
  readonly status: "error" | "loading" | "ready"
}

const initialState: FavouritesState = {
  error: "",
  items: [],
  mutationError: undefined,
  pending: undefined,
  status: "loading",
}

const errorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.includes(FAVOURITES_LIMIT_ERROR)) {
    return `You can save up to ${FAVOURITES_LIMIT} favourite channels. Remove one on Home before saving another. Escape returns to Home.`
  }
  return error instanceof Error ? error.message : "Could not update local favourites. Try again."
}

export const useFavourites = () => {
  const [state, setState] = useState(initialState)
  const generation = useRef(0)
  const pending = useRef<"list" | "mutation" | undefined>(undefined)

  const load = useCallback(async (): Promise<void> => {
    if (pending.current !== undefined) return
    const requestId = ++generation.current
    pending.current = "list"
    setState((current) => ({ ...current, error: "", status: "loading" }))
    try {
      const items = await window.vacuumStream.favourites.list()
      if (requestId !== generation.current) return
      setState((current) => ({ ...current, items, status: "ready" }))
    } catch (error) {
      if (requestId !== generation.current) return
      setState((current) => ({ ...current, error: errorMessage(error), status: "error" }))
    } finally {
      if (requestId === generation.current) pending.current = undefined
    }
  }, [])

  useEffect(() => {
    void load()
    return () => {
      generation.current += 1
      pending.current = undefined
    }
  }, [load])

  const mutate = async (operation: "add" | "remove", entry: Favourite): Promise<void> => {
    // Serialize renderer mutations; a mutation may supersede an obsolete read, never a write.
    if (pending.current === "mutation") return
    const requestId = ++generation.current
    pending.current = "mutation"
    const mutation = { login: entry.login, operation }
    setState((current) => ({
      ...current,
      error: "",
      mutationError: undefined,
      pending: mutation,
      status: "ready",
    }))
    try {
      const items = await (operation === "add"
        ? window.vacuumStream.favourites.add(entry)
        : window.vacuumStream.favourites.remove(entry.login))
      if (requestId !== generation.current) return
      // The store returns the committed list. A second read could race a subsequent mutation.
      setState({ ...initialState, items, status: "ready" })
    } catch (error) {
      if (requestId !== generation.current) return
      setState((current) => ({
        ...current,
        mutationError: { ...mutation, message: errorMessage(error) },
        pending: undefined,
      }))
    } finally {
      if (requestId === generation.current) pending.current = undefined
    }
  }

  return {
    ...state,
    add: (entry: Favourite) => mutate("add", entry),
    remove: (login: string) => mutate("remove", { login }),
    retry: load,
  }
}
