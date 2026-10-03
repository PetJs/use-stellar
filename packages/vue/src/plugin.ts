import type { App, InjectionKey, Plugin } from "vue"
import type { WalletAdapter } from "@stellar-wallet-kit/core"
import { WALLET_KEY } from "./useWallet"

export interface WalletPluginOptions {
  adapters: WalletAdapter[]
  /**
   * When true, the plugin will attempt to restore a previous wallet session
   * on mount. Silent-capable adapters reconnect automatically; prompting
   * adapters only restore intent and populate `restoredWallet`.
   */
  autoConnect?: boolean
  /**
   * When true, the public address of the connected wallet is persisted
   * alongside the wallet type. Never persists secret material.
   */
  persistAddress?: boolean
}

export const WALLET_PORT_KEY: InjectionKey<WalletPluginOptions> = Symbol("stellar-wallet-options")

export const WalletPlugin: Plugin = {
  install(app: App, options: WalletPluginOptions) {
    app.provide(WALLET_PORT_KEY, options)
    app.provide(WALLET_KEY, options.adapters)
  },
}

export default WalletPlugin
/**
 * Vue plugin that provides the Stellar runtime to all components.
 *
 * This plugin creates and injects a `StellarRuntime` instance, making it
 * available to composables via `useStellar()`.
 */

import { type App, inject } from "vue"
import { createStellarRuntime, type StellarRuntime, type StellarRuntimeOptions } from "use-stellar"

/**
 * Options for creating the Stellar Vue plugin.
 */
export type CreateStellarPluginOptions = StellarRuntimeOptions

/**
 * Injection key for the Stellar runtime.
 * @internal
 */
export const StellarRuntimeKey = Symbol("StellarRuntime") as InjectionKey<StellarRuntime>

/**
 * Creates and returns a Vue plugin that provides the Stellar runtime.
 *
 * The plugin initializes a `StellarRuntime` instance with the given options
 * and makes it available to all components and composables via the Vue
 * injection system.
 *
 * @param options Configuration for the runtime
 * @returns A Vue plugin function
 *
 * @example
 * const app = createApp(App)
 * app.use(createStellarPlugin({
 *   networkConfig: {
 *     network: "testnet",
 *     horizonUrl: "https://horizon-testnet.stellar.org",
 *     sorobanUrl: "https://soroban-testnet.stellar.org",
 *     networkPassphrase: "Test SDF Network ; September 2015"
 *   }
 * }))
 */
export function createStellarPlugin(options: CreateStellarPluginOptions) {
  return (app: App) => {
    const runtime = createStellarRuntime(options)
    app.provide(StellarRuntimeKey, runtime)
  }
}

/**
 * Retrieves the injected Stellar runtime from the current component context.
 *
 * @internal Used by `useStellar()` to access the runtime.
 * @throws {Error} If called outside a component with the plugin installed
 */
export function injectStellarRuntime(): StellarRuntime {
  const runtime = inject<StellarRuntime | undefined>(StellarRuntimeKey)
  if (!runtime) {
    throw new Error(
      "@use-stellar/vue: No StellarRuntime found. " +
        "Make sure to call app.use(createStellarPlugin(...)) before mounting your app."
    )
  }
  return runtime
}

// Type helper for Vue's injection
type InjectionKey<T> = symbol & { __type?: T }
