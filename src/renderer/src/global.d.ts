import type { VacuumStreamApi } from "../../shared/contracts"

declare global {
  interface Window {
    readonly vacuumStream: VacuumStreamApi
  }
}
