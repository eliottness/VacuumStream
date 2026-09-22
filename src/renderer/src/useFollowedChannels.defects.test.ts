// @vitest-environment jsdom

import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CursorInput, Page } from "../../shared/contracts"
import { useStreamCatalog } from "./useFollowedChannels"

type Channel = { readonly id: string }

const page = (index: number): Page<Channel> => ({
  cursor: `cursor-${index}`,
  items: Array.from({ length: 20 }, (_, offset) => ({ id: `channel-${index}-${offset}` })),
})

describe("followed channel catalog defect regressions", () => {
  let root: Root
  let catalog: ReturnType<typeof useStreamCatalog<Channel, CursorInput>> | undefined

  const Surface = () => {
    catalog = useStreamCatalog(async (input) =>
      page(input.after === undefined ? 1 : Number(input.after.slice(7)) + 1),
    )
    return null
  }

  beforeEach(async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    const container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(createElement(Surface)))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    catalog = undefined
    document.body.replaceChildren()
    vi.unstubAllGlobals()
  })

  it.fails("D-xc-performance-5 caps retained followed-channel pages while preserving the newest cursor", async () => {
    for (let index = 0; index < 6; index += 1) {
      const current = catalog
      if (current === undefined) throw new Error("Catalog hook did not mount")
      await act(async () => current.load({ after: current.catalog.cursor, first: 20 }))
    }

    expect(catalog?.catalog.cursor).toBe("cursor-6")
    expect(catalog?.catalog.items.length).toBeLessThan(120)
  })
})
