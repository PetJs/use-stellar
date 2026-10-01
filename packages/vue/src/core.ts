/**
 * @use-stellar/vue/core — Re-exports the shared runtime utilities
 *
 * This entry point allows Vue consumers to import framework-neutral runtime
 * utilities and type definitions directly:
 *
 * @example
 * import { createStellarRuntime } from "@use-stellar/vue/core"
 * import type { StellarRuntimeSnapshot } from "@use-stellar/vue/core"
 */

export {
  createStellarRuntime,
  type StellarRuntime,
  type StellarRuntimeOptions,
  type StellarRuntimeSnapshot,
  type StellarRuntimeListener,
} from "use-stellar/runtime/StellarRuntime"

export {
  readWalletSession,
  writeWalletSession,
  clearWalletSession,
  getWalletSessionStorage,
  WALLET_SESSION_STORAGE_KEY,
  type PersistedWalletSession,
  type WalletSessionStorage,
} from "use-stellar/runtime/walletSession"

// Re-export all core types and utilities for convenience
export * from "use-stellar"
export type * from "use-stellar"
