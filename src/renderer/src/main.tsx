import "@fontsource-variable/atkinson-hyperlegible-next"
import React from "react"
import ReactDOM from "react-dom/client"
import { App } from "./App"
import { Showcase } from "./Showcase"
import "./styles.css"

if (import.meta.env.DEV && import.meta.env.VITE_DISABLE_REACT_DEVTOOLS !== "1") {
  void import("react-grab")
  void import("react-scan")
}

const rootElement = document.querySelector("#root")

if (rootElement === null) {
  throw new TypeError("VacuumStream root element is missing")
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).has("showcase") ? <Showcase /> : <App />}
  </React.StrictMode>,
)
