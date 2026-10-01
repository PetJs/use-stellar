import {
  computed,
  effectScope,
  getCurrentInstance,
  getCurrentScope,
  inject,
  onScopeDispose,
  provide,
  reactive,
  readonly,
  ref,
  toRefs,
  watch,
} from "vue"
import type { ComputedRef, DeepReadonly, InjectionKey, Ref, ToRefs } from "vue"
import { createStellarError, getWalletAdapter, isBrowser, toStellarError } from "@use-stellar/core"
import type {
  StellarNetwork,
  WalletAdapter,
  WalletChange,
  WalletState,
  WalletType,
} from "@use-stellar/core"

export interface WalletRuntimeOptions {
  /** The network the app expects the wallet to be on. Defaults to `"testnet"`. */
  network?: StellarNetwork
}

/**
 * Wallet state shared by every `useWallet()` consumer in an app.
 *
 * The runtime — not each composable — owns the adapter subscription, so N
 * mounted components result in exactly one extension watcher.
 */
export interface WalletRuntime {
  state: DeepReadonly<Required<WalletState>>
  network: Ref<StellarNetwork>
  isNetworkMismatch: ComputedRef<boolean>
  connect: (wallet?: WalletType) => Promise<void>
  disconnect: () => void
  refreshWalletNetwork: () => Promise<void>
  /**
   * Registers a consumer. The adapter subscription only runs while at least
   * one consumer is retained. Returns the matching release function.
   */
  retain: () => () => void
  /** Tears down the subscription and internal watchers. */
  dispose: () => void
}

export type UseWalletReturn = ToRefs<DeepReadonly<Required<WalletState>>> & {
  connect: (wallet?: WalletType) => Promise<void>
  disconnect: () => void
  refreshWalletNetwork: () => Promise<void>
  isNetworkMismatch: ComputedRef<boolean>
}

export interface UseWalletOptions {
  /** Use this runtime instead of the injected (or default) one. */
  runtime?: WalletRuntime
}

export const WALLET_RUNTIME_KEY: InjectionKey<WalletRuntime> = Symbol("use-stellar:wallet-runtime")

function emptyWalletState(): Required<WalletState> {
  return {
    connected: false,
    connecting: false,
    address: null,
    network: null,
    wallet: null,
    walletName: null,
    error: null,
    walletNetwork: null,
    walletNetworkPassphrase: null,
  }
}

async function resolveWalletNetwork(
  adapter: WalletAdapter,
  network: StellarNetwork
): Promise<Pick<Required<WalletState>, "walletNetwork" | "walletNetworkPassphrase">> {
  const state = await adapter.getNetworkDetails(network)
  return {
    walletNetwork: state.network,
    walletNetworkPassphrase: state.networkPassphrase,
  }
}

/**
 * Creates the wallet runtime shared by `useWallet()` consumers. Install it for
 * an app with {@link provideWalletRuntime}; without one, a lazily-created
 * default runtime on testnet is used.
 */
export function createWalletRuntime(options: WalletRuntimeOptions = {}): WalletRuntime {
  const state = reactive<Required<WalletState>>(emptyWalletState())
  const network = ref<StellarNetwork>(options.network ?? "testnet")

  // Bumped on every connect/disconnect so async results that resolve after the
  // session they belong to has ended are dropped instead of applied.
  let session = 0
  const consumers = ref(0)

  let activeUnsubscribe: (() => void) | null = null
  // Identifies the live subscription; a handler whose token is stale belongs to
  // a subscription that has already been torn down.
  let activeToken: symbol | null = null

  function unsubscribe() {
    activeToken = null
    const stop = activeUnsubscribe
    activeUnsubscribe = null
    try {
      stop?.()
    } catch {
      // An adapter that fails to unsubscribe cannot reach us anyway — the
      // token above is already invalidated.
    }
  }

  function subscribe(walletType: WalletType) {
    let adapter: WalletAdapter
    try {
      adapter = getWalletAdapter(walletType)
    } catch {
      return
    }

    // Adapters that cannot report changes omit `subscribe`, so nothing here
    // branches on wallet type.
    if (!adapter.subscribe) return

    const token = Symbol("wallet-subscription")
    activeToken = token

    const handleChange = (change: WalletChange) => {
      if (activeToken !== token || !state.connected) return

      state.address = change.address ?? state.address
      state.walletNetwork = change.network
      state.walletNetworkPassphrase = change.networkPassphrase
    }

    try {
      activeUnsubscribe = adapter.subscribe(handleChange)
    } catch {
      activeToken = null
    }
  }

  const scope = effectScope(true)

  scope.run(() => {
    // Subscribe only while connected and observed; resubscribe when the wallet
    // changes; unsubscribe on disconnect. `flush: "sync"` means a disconnect
    // tears the subscription down before any later event can be delivered.
    // The source is a primitive so the watcher only fires when the wallet to
    // watch actually changes, not on every consumer mount or field update.
    watch(
      () =>
        state.connected && state.wallet && consumers.value > 0 && isBrowser() ? state.wallet : null,
      walletType => {
        unsubscribe()
        if (walletType) subscribe(walletType)
      },
      { flush: "sync" }
    )
  })

  function retain() {
    consumers.value += 1
    let released = false
    return () => {
      if (released) return
      released = true
      consumers.value -= 1
    }
  }

  const isNetworkMismatch = computed(() => {
    if (!state.connected || !state.walletNetwork) return false
    return state.network !== state.walletNetwork
  })

  async function connect(walletType: WalletType = "freighter") {
    if (!isBrowser()) {
      state.error = createStellarError(
        "VALIDATION_ERROR",
        "Wallet connection is only available in the browser. Move the call into client-only code (e.g. onMounted)."
      )
      return
    }

    const current = ++session
    const targetNetwork = network.value
    state.connecting = true
    state.error = null

    try {
      const adapter = getWalletAdapter(walletType)
      const connection = await adapter.connect(targetNetwork)

      // The wallet's own network, not the one we asked for — otherwise the
      // mismatch check compares a value with itself and never fires.
      const walletNetwork = await resolveWalletNetwork(adapter, targetNetwork)
      if (current !== session) return

      Object.assign(state, {
        connected: true,
        connecting: false,
        address: connection.address,
        network: targetNetwork,
        wallet: connection.wallet,
        walletName: adapter.metadata.name,
        error: null,
        ...walletNetwork,
      })
    } catch (err) {
      if (current !== session) return
      state.connecting = false
      state.error = toStellarError(err)
    }
  }

  function disconnect() {
    session += 1

    if (state.wallet) {
      try {
        void getWalletAdapter(state.wallet).disconnect?.()
      } catch {
        // A wallet we can no longer resolve is already disconnected as far as
        // the app is concerned — clearing state below is the whole job.
      }
    }

    Object.assign(state, emptyWalletState())
  }

  async function refreshWalletNetwork() {
    if (!state.connected || !state.wallet || !state.network) return

    const current = session
    const walletType = state.wallet

    try {
      const adapter = getWalletAdapter(walletType)
      const resolved = await resolveWalletNetwork(adapter, state.network)
      if (current !== session || !state.connected) return

      state.walletNetwork = resolved.walletNetwork
      state.walletNetworkPassphrase = resolved.walletNetworkPassphrase
      state.error = null
    } catch (err) {
      if (current !== session) return
      state.error = toStellarError(err)
    }
  }

  function dispose() {
    unsubscribe()
    scope.stop()
  }

  return {
    state: readonly(state),
    network,
    isNetworkMismatch,
    connect,
    disconnect,
    refreshWalletNetwork,
    retain,
    dispose,
  }
}

/** Makes `runtime` the wallet runtime for the calling component's subtree. */
export function provideWalletRuntime(runtime: WalletRuntime): void {
  provide(WALLET_RUNTIME_KEY, runtime)
}

let defaultRuntime: WalletRuntime | null = null

function resolveRuntime(options: UseWalletOptions): WalletRuntime {
  if (options.runtime) return options.runtime

  const injected = getCurrentInstance() ? inject(WALLET_RUNTIME_KEY, null) : null
  if (injected) return injected

  defaultRuntime ??= createWalletRuntime()
  return defaultRuntime
}

/**
 * Wallet connection state and actions.
 *
 * While connected, changes the user makes inside their wallet extension
 * (switching account or network) arrive through the adapter's subscription and
 * update `address`, `walletNetwork` and `walletNetworkPassphrase` reactively.
 * The subscription is owned by the shared runtime, so any number of
 * `useWallet()` calls share a single extension watcher.
 *
 * Block signing while `isNetworkMismatch` is `true`.
 *
 * @example
 * const { address, isNetworkMismatch, connect } = useWallet()
 * await connect("freighter")
 */
export function useWallet(options: UseWalletOptions = {}): UseWalletReturn {
  const runtime = resolveRuntime(options)

  if (getCurrentScope()) {
    onScopeDispose(runtime.retain())
  } else {
    // No scope to release against: this consumer lives as long as the runtime.
    runtime.retain()
  }

  return {
    ...toRefs(runtime.state),
    connect: runtime.connect,
    disconnect: runtime.disconnect,
    refreshWalletNetwork: runtime.refreshWalletNetwork,
    isNetworkMismatch: runtime.isNetworkMismatch,
  }
}
