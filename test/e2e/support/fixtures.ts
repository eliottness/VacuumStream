import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  test as base,
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
} from "@playwright/test"
import { REPOSITORY_ROOT } from "./ledger"

const { DISPLAY } = process.env

export type SeededFavourite = { readonly login: string; readonly userId?: string }

export type SeededBookmark = {
  readonly details?: { readonly title: string; readonly userId: string }
  readonly duration: number
  readonly position: number
  readonly updatedAt: number
  readonly videoId: string
}

export type ProfileSeed = {
  readonly bookmarks?: readonly SeededBookmark[]
  readonly favourites?: readonly SeededFavourite[]
  readonly rawFiles?: Readonly<Record<string, string>>
  readonly settings?: { readonly clientId: string }
}

export type WindowSize = { readonly height: number; readonly width: number }

export type Controller = {
  focusId(): Promise<string>
  press(key: string, times?: number): Promise<void>
  shot(name: string): Promise<string>
  trace(keys: readonly string[]): Promise<readonly string[]>
  travelTo(target: string, key?: string, maxPresses?: number): Promise<boolean>
  waitForFocus(target: string, timeoutMs?: number): Promise<void>
}

export type E2EFixtures = {
  app: ElectronApplication
  controller: Controller
  profileDirectory: string
  seed: ProfileSeed
  window: Page
  windowSize: WindowSize
}

const writeSeed = async (directory: string, seed: ProfileSeed): Promise<void> => {
  if (seed.favourites !== undefined) {
    await writeFile(
      join(directory, "favourites.json"),
      JSON.stringify({ favourites: seed.favourites, version: 1 }),
    )
  }
  if (seed.bookmarks !== undefined) {
    const bookmarks: Record<string, Omit<SeededBookmark, "videoId">> = {}
    for (const { videoId, ...value } of seed.bookmarks) bookmarks[videoId] = value
    await writeFile(
      join(directory, "playback-progress.json"),
      JSON.stringify({ bookmarks, version: 1 }),
    )
  }
  if (seed.settings !== undefined) {
    await writeFile(join(directory, "settings.json"), JSON.stringify(seed.settings))
  }
  for (const [name, contents] of Object.entries(seed.rawFiles ?? {})) {
    await writeFile(join(directory, name), contents)
  }
}

const settle = async (page: Page): Promise<void> => {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve()
          })
        })
      }),
  )
}

const activeFocusId = (page: Page): Promise<string> =>
  page.evaluate(() => {
    const active = document.activeElement
    if (active === null) return "NONE"
    if (active === document.body) return "BODY"
    return active.getAttribute("data-focus-id") ?? active.tagName
  })

export const test = base.extend<E2EFixtures>({
  seed: [{}, { option: true }],
  windowSize: [{ height: 1080, width: 1920 }, { option: true }],

  profileDirectory: async ({ seed }, use) => {
    const directory = await mkdtemp(join(tmpdir(), "vs-e2e-"))
    await writeSeed(directory, seed)
    await use(directory)
    await rm(directory, { force: true, recursive: true })
  },

  app: async ({ profileDirectory, windowSize }, use) => {
    const application = await electron.launch({
      args: [".", `--user-data-dir=${profileDirectory}`],
      cwd: REPOSITORY_ROOT,
      env: { ...process.env, DISPLAY: DISPLAY ?? ":0" },
      timeout: 60_000,
    })
    await application.evaluate(async ({ BrowserWindow }, size) => {
      const [window] = BrowserWindow.getAllWindows()
      window?.setContentSize(size.width, size.height)
    }, windowSize)
    await use(application)
    await application.close()
  },

  window: async ({ app }, use) => {
    const page = await app.firstWindow({ timeout: 60_000 })
    await page.waitForLoadState("domcontentloaded")
    await page.waitForSelector("[data-focus-id]", { timeout: 30_000 })
    await use(page)
    const info = test.info()
    const path = info.outputPath("final-state.png")
    await page.screenshot({ path }).catch(() => undefined)
    await info.attach("final-state", { contentType: "image/png", path }).catch(() => undefined)
  },

  controller: async ({ window }, use) => {
    const controller: Controller = {
      focusId: () => activeFocusId(window),
      press: async (key, times = 1) => {
        for (let index = 0; index < times; index += 1) {
          await window.keyboard.press(key)
          await settle(window)
        }
      },
      shot: async (name) => {
        const path = test.info().outputPath(`${name}.png`)
        await window.screenshot({ path })
        await test.info().attach(name, { contentType: "image/png", path })
        return path
      },
      trace: async (keys) => {
        const visited: string[] = []
        for (const key of keys) {
          await window.keyboard.press(key)
          await settle(window)
          visited.push(await activeFocusId(window))
        }
        return visited
      },
      travelTo: async (target, key = "ArrowRight", maxPresses = 12) => {
        for (let index = 0; index < maxPresses; index += 1) {
          if ((await activeFocusId(window)) === target) return true
          await window.keyboard.press(key)
          await settle(window)
        }
        return (await activeFocusId(window)) === target
      },
      waitForFocus: async (target, timeoutMs = 10_000) => {
        await window.waitForFunction(
          (id) => document.activeElement?.getAttribute("data-focus-id") === id,
          target,
          { timeout: timeoutMs },
        )
      },
    }
    await use(controller)
  },
})

export { expect }
