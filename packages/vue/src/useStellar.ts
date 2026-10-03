/**
 * useStellar — Vue composable that exposes the Stellar runtime state reactively.
 *
 * This is the base composable that all other Stellar Vue composables depend on.
 * It provides access to the runtime instance and reactive snapshots of its state.
 *
 * @example
 * import { useStellar } from "@use-stellar/vue"
 *
 * export default {
 *   setup() {
 *     const { snapshot, runtime } = useStellar()
 *     return { snapshot, runtime }
 *   }
 * }
 *
 * // In a script setup:
 * const { snapshot, runtime } = useStellar()
 */

import { reactive, onScopeDispose, type Readonly } from "vue"
import type { StellarRuntime, StellarRuntimeSnapshot } from "use-stellar"
import { injectStellarRuntime } from "./plugin"

/**
 * Return value from the `useStellar` composable.
 */
export interface UseStellarReturn {
  /**
   * The underlying runtime instance. Use this for advanced APIs or direct
   * integration. Avoid mutating the runtime directly; use update methods instead.
   */
  runtime: StellarRuntime

  /**
   * A reactive, readonly snapshot of the current runtime state.
   * This updates automatically when the runtime state changes.
   *
   * Contains:
   * - `network`: The active Stellar network ("testnet" | "mainnet" | "futurenet" | "custom")
   * - `networkConfig`: The resolved network configuration (Horizon/Soroban URLs, passphrase)
   * - `wallet`: The current wallet connection state
   */
  snapshot: Readonly<StellarRuntimeSnapshot>
}

/**
 * Vue composable that exposes the injected Stellar runtime with reactive state.
 *
 * **Lifecycle:**
 * - On use: Subscribes to runtime changes
 * - When runtime updates: The reactive snapshot updates, triggering component re-renders
 * - On component unmount: Automatically unsubscribes from the runtime
 *
 * **Error handling:**
 * Throws an error if called outside a component hierarchy with the plugin installed.
 * Ensure `app.use(createStellarPlugin(...))` is called before mounting.
 *
 * @returns An object with `runtime` and a reactive readonly `snapshot`
 * @throws {Error} If the plugin is not installed
 *
 * @example
 * // Get the current wallet address
 * const { snapshot } = useStellar()
 * watch(() => snapshot.wallet.address, (address) => {
 *   console.log("Wallet connected:", address)
 * })
 *
 * @example
 * // Use the runtime for advanced APIs
 * const { runtime } = useStellar()
 * const store = runtime.getQueryStore()
 */
export function useStellar(): UseStellarReturn {
  const runtime = injectStellarRuntime()

  // Create a reactive snapshot of the initial state
  const snapshot = reactive<StellarRuntimeSnapshot>(runtime.getSnapshot())

  // Subscribe to runtime changes and update the reactive snapshot
  const unsubscribe = runtime.subscribe(newSnapshot => {
    // Update each field to trigger reactivity
    snapshot.network = newSnapshot.network
    snapshot.networkConfig = newSnapshot.networkConfig
    snapshot.wallet = newSnapshot.wallet
  })

  // Automatically unsubscribe when the component scope is disposed
  onScopeDispose(() => {
    unsubscribe()
  })

  return {
    runtime,
    snapshot: snapshot as Readonly<StellarRuntimeSnapshot>,
  }
}
