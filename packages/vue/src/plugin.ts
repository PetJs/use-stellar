/**
 * Vue plugin that provides the Stellar runtime to all components.
 *
 * This plugin creates and injects a `StellarRuntime` instance, making it
 * available to composables via `useStellar()`.
 */

import { type App, inject } from "vue"
import {
  createStellarRuntime,
  type StellarRuntime,
  type StellarRuntimeOptions,
} from "use-stellar"

/**
 * Options for creating the Stellar Vue plugin.
 */
export interface CreateStellarPluginOptions extends StellarRuntimeOptions {}

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
        'Make sure to call app.use(createStellarPlugin(...)) before mounting your app.'
    )
  }
  return runtime
}

// Type helper for Vue's injection
type InjectionKey<T> = Symbol & { __type?: T }
