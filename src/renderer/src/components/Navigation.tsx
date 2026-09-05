import {
  GearIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  StarIcon,
  TwitchLogoIcon,
} from "@phosphor-icons/react"

export type RouteName = "following" | "home" | "search" | "settings"

type NavigationProps = {
  readonly active: RouteName
  readonly onNavigate: (route: RouteName) => void
}

const items = [
  { icon: HouseIcon, label: "Home", route: "home" },
  { icon: StarIcon, label: "Following", route: "following" },
  { icon: MagnifyingGlassIcon, label: "Search", route: "search" },
] as const

export const Navigation = ({ active, onNavigate }: NavigationProps) => (
  <nav className="navigation" aria-label="Primary">
    <div className="navigation__brand" title="VacuumStream">
      <TwitchLogoIcon aria-hidden="true" weight="fill" />
      <strong>VS</strong>
    </div>
    <div className="navigation__items">
      {items.map(({ icon: Icon, label, route }) => (
        <button
          aria-current={active === route ? "page" : undefined}
          className="navigation__item"
          data-focus-id={`nav-${route}`}
          data-focusable="true"
          key={route}
          onClick={() => onNavigate(route)}
          type="button"
        >
          <Icon aria-hidden="true" weight={active === route ? "fill" : "regular"} />
          <span>{label}</span>
        </button>
      ))}
    </div>
    <button
      aria-current={active === "settings" ? "page" : undefined}
      className="navigation__item navigation__settings"
      data-focus-id="nav-settings"
      data-focusable="true"
      onClick={() => onNavigate("settings")}
      type="button"
    >
      <GearIcon aria-hidden="true" />
      <span>Settings</span>
    </button>
  </nav>
)
