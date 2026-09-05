import type { CategoryCard, StreamCard } from "../../shared/contracts"

export const PREVIEW_STREAMS = [
  {
    category: "Twitch",
    id: "preview-twitch",
    startedAt: "",
    tags: ["Preview"],
    thumbnailUrl: "/signal-preview.svg",
    title: "Twitch official channel",
    userId: "0",
    userLogin: "twitch",
    userName: "Twitch",
    viewerCount: 0,
  },
  {
    category: "League of Legends",
    id: "preview-riotgames",
    startedAt: "",
    tags: ["Preview"],
    thumbnailUrl: "/signal-preview.svg",
    title: "Riot Games",
    userId: "0",
    userLogin: "riotgames",
    userName: "Riot Games",
    viewerCount: 0,
  },
  {
    category: "Counter-Strike",
    id: "preview-eslcs",
    startedAt: "",
    tags: ["Preview"],
    thumbnailUrl: "/signal-preview.svg",
    title: "ESL Counter-Strike",
    userId: "0",
    userLogin: "eslcs",
    userName: "ESL CS",
    viewerCount: 0,
  },
  {
    category: "League of Legends",
    id: "preview-lck",
    startedAt: "",
    tags: ["Preview"],
    thumbnailUrl: "/signal-preview.svg",
    title: "LCK",
    userId: "0",
    userLogin: "lck",
    userName: "LCK",
    viewerCount: 0,
  },
] satisfies readonly StreamCard[]

export const PREVIEW_CATEGORIES = [
  {
    boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/509658-384x512.jpg",
    id: "509658",
    name: "Just Chatting",
  },
  {
    boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/21779-384x512.jpg",
    id: "21779",
    name: "League of Legends",
  },
  {
    boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/32399-384x512.jpg",
    id: "32399",
    name: "Counter-Strike",
  },
  {
    boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/33214-384x512.jpg",
    id: "33214",
    name: "Fortnite",
  },
  {
    boxArtUrl: "https://static-cdn.jtvnw.net/ttv-boxart/516575-384x512.jpg",
    id: "516575",
    name: "VALORANT",
  },
] satisfies readonly CategoryCard[]
