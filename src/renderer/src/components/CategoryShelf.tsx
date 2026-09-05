import type { CategoryCard } from "../../../shared/contracts"

type CategoryShelfProps = {
  readonly categories: readonly CategoryCard[]
  readonly onSelect: (category: CategoryCard) => void
}

export const CategoryShelf = ({ categories, onSelect }: CategoryShelfProps) => (
  <section className="shelf" aria-labelledby="top-categories">
    <div className="shelf__heading">
      <h2 id="top-categories">Top categories</h2>
      <span>Browse by game</span>
    </div>
    <div className="category-reel">
      {categories.map((category) => (
        <button
          aria-label={`Search ${category.name}`}
          className="category-card"
          data-focus-id={`category-${category.id}`}
          data-focusable="true"
          key={category.id}
          onClick={() => onSelect(category)}
          type="button"
        >
          <span className="category-card__art">
            <span className="image-fallback">Artwork unavailable</span>
            <img
              alt=""
              height="512"
              loading="lazy"
              onError={(event) => {
                event.currentTarget.hidden = true
              }}
              src={category.boxArtUrl}
              width="384"
            />
          </span>
          <strong>{category.name}</strong>
        </button>
      ))}
    </div>
  </section>
)
