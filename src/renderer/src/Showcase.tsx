import { CategoryShelf } from "./components/CategoryShelf"
import { StreamShelf } from "./components/StreamShelf"
import { PREVIEW_CATEGORIES, PREVIEW_STREAMS } from "./demo-data"

export const Showcase = () => (
  <main className="showcase">
    <header className="page-heading">
      <span>Development surface</span>
      <h1>Primitive showcase</h1>
      <p>Focus, loading, empty, disabled, and content states for visual QA.</p>
    </header>
    <section className="showcase__buttons" aria-labelledby="buttons-heading">
      <h2 id="buttons-heading">Actions</h2>
      <button className="primary-button" data-focusable="true" type="button">
        Primary action
      </button>
      <button data-focusable="true" type="button">
        Secondary action
      </button>
      <button data-focusable="true" disabled type="button">
        Disabled action
      </button>
      <button className="showcase-focus-sample" data-focusable="true" type="button">
        Focus sample
      </button>
    </section>
    <StreamShelf
      emptyMessage="No live channels are available."
      onSelect={() => undefined}
      streams={PREVIEW_STREAMS}
      title="Live card states"
    />
    <StreamShelf
      emptyMessage=""
      onSelect={() => undefined}
      state="loading"
      streams={[]}
      title="Loading state"
    />
    <StreamShelf
      emptyMessage=""
      onRetry={() => undefined}
      onSelect={() => undefined}
      state="error"
      streams={[]}
      title="Error state"
    />
    <StreamShelf
      emptyMessage="Follow channels on Twitch to see them here."
      onSelect={() => undefined}
      streams={[]}
      title="Empty state"
    />
    <CategoryShelf categories={PREVIEW_CATEGORIES} onSelect={() => undefined} />
  </main>
)
