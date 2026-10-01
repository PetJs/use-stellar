import { describe, it, expect, vi, beforeEach } from "vitest"
import { effectScope, nextTick } from "vue"
import type { StellarNetwork, WalletChange } from "@use-stellar/core"

const TESTNET_PASSPHRASE = "Test SDF Network ; September 2015"
const MAINNET_PASSPHRASE = "Public Global Stellar Network ; September 2015"

const adapters = new Map<string, FakeAdapter>()

vi.mock("@use-stellar/core", () => ({
  isBrowser: () => true,
  getWalletAdapter: (type: string) => {
    const adapter = adapters.get(type)
    if (!adapter) throw new Error(`Unknown wallet: ${type}`)
    return adapter
  },
  toStellarError: (err: unknown) => ({
    code: "WALLET_ERROR",
    message: err instanceof Error ? err.message : String(err),
  }),
  createStellarError: (code: string, message: string) => ({ code, message }),
}))

import { createWalletRuntime, useWallet } from "./useWallet"
import type { WalletRuntime } from "./useWallet"

type Handler = (change: WalletChange) => void

interface FakeAdapter {
  metadata: { type: string; name: string; supported: boolean }
  isAvailable: ReturnType<typeof vi.fn>
  connect: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
  getNetworkDetails: ReturnType<typeof vi.fn>
  signTransaction: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
  handlers: Set<Handler>
  /** Every handler ever registered, including unsubscribed ones. */
  allHandlers: Handler[]
  emit: (change: WalletChange) => void
}

function createFakeAdapter(
  type: string,
  opts: { address?: string; walletNetwork?: StellarNetwork; passphrase?: string } = {}
): FakeAdapter {
  const handlers = new Set<Handler>()
  const allHandlers: Handler[] = []
  const address = opts.address ?? "GACCOUNTONE"
  const walletNetwork = opts.walletNetwork ?? "testnet"
  const passphrase = opts.passphrase ?? TESTNET_PASSPHRASE

  const adapter: FakeAdapter = {
    metadata: { type, name: `Fake ${type}`, supported: true },
    isAvailable: vi.fn(async () => true),
    connect: vi.fn(async (network: StellarNetwork) => ({
      address,
      wallet: type,
      network,
      networkPassphrase: passphrase,
    })),
    disconnect: vi.fn(),
    getNetworkDetails: vi.fn(async () => ({
      network: walletNetwork,
      networkPassphrase: passphrase,
    })),
    signTransaction: vi.fn(),
    subscribe: vi.fn((handler: Handler) => {
      handlers.add(handler)
      allHandlers.push(handler)
      return () => {
        handlers.delete(handler)
      }
    }),
    handlers,
    allHandlers,
    emit: change => handlers.forEach(h => h(change)),
  }

  adapters.set(type, adapter)
  return adapter
}

/** Runs `useWallet` inside its own effect scope, like a mounted component. */
function mountConsumer(runtime: WalletRuntime) {
  const scope = effectScope()
  const wallet = scope.run(() => useWallet({ runtime }))!
  return { wallet, unmount: () => scope.stop() }
}

describe("useWallet change events", () => {
  let runtime: WalletRuntime
  let freighter: FakeAdapter

  beforeEach(() => {
    adapters.clear()
    freighter = createFakeAdapter("freighter")
    runtime = createWalletRuntime({ network: "testnet" })
  })

  it("updates address and network reactively on wallet change events", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")

    expect(wallet.address.value).toBe("GACCOUNTONE")
    expect(wallet.walletNetwork.value).toBe("testnet")

    freighter.emit({
      address: "GACCOUNTTWO",
      network: "testnet",
      networkPassphrase: TESTNET_PASSPHRASE,
    })
    expect(wallet.address.value).toBe("GACCOUNTTWO")

    freighter.emit({
      address: "GACCOUNTTWO",
      network: "mainnet",
      networkPassphrase: MAINNET_PASSPHRASE,
    })
    expect(wallet.walletNetwork.value).toBe("mainnet")
    expect(wallet.walletNetworkPassphrase.value).toBe(MAINNET_PASSPHRASE)
    expect(wallet.isNetworkMismatch.value).toBe(true)
  })

  it("keeps the current address when a change carries no account", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")

    freighter.emit({
      address: null,
      network: "futurenet",
      networkPassphrase: "Test SDF Future Network ; October 2022",
    })

    expect(wallet.address.value).toBe("GACCOUNTONE")
    expect(wallet.walletNetwork.value).toBe("futurenet")
  })

  it("creates exactly one adapter subscription regardless of consumer count", async () => {
    const consumers = Array.from({ length: 5 }, () => mountConsumer(runtime))
    await consumers[0].wallet.connect("freighter")

    expect(freighter.subscribe).toHaveBeenCalledTimes(1)
    expect(freighter.handlers.size).toBe(1)

    freighter.emit({
      address: "GACCOUNTTWO",
      network: "testnet",
      networkPassphrase: TESTNET_PASSPHRASE,
    })
    for (const { wallet } of consumers) {
      expect(wallet.address.value).toBe("GACCOUNTTWO")
    }

    // Mounting more consumers while connected does not add watchers.
    mountConsumer(runtime)
    await nextTick()
    expect(freighter.subscribe).toHaveBeenCalledTimes(1)
  })

  it("does not subscribe before connecting, or for adapters without subscribe", async () => {
    const { wallet } = mountConsumer(runtime)
    expect(freighter.subscribe).not.toHaveBeenCalled()

    const albedo = createFakeAdapter("albedo")
    // @ts-expect-error — simulate an adapter that cannot report changes.
    delete albedo.subscribe
    await wallet.connect("albedo")

    expect(wallet.connected.value).toBe(true)
    expect(freighter.subscribe).not.toHaveBeenCalled()
  })

  it("unsubscribes on disconnect and ignores late events", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")
    const [handler] = freighter.allHandlers

    wallet.disconnect()
    expect(freighter.handlers.size).toBe(0)

    // An extension that still delivers an event it queued before unsubscribing.
    handler({ address: "GLATE", network: "mainnet", networkPassphrase: MAINNET_PASSPHRASE })

    expect(wallet.connected.value).toBe(false)
    expect(wallet.address.value).toBeNull()
    expect(wallet.walletNetwork.value).toBeNull()
    expect(wallet.isNetworkMismatch.value).toBe(false)
  })

  it("ignores late events from a previous session after reconnecting", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")
    const [staleHandler] = freighter.allHandlers

    wallet.disconnect()
    await wallet.connect("freighter")
    expect(freighter.subscribe).toHaveBeenCalledTimes(2)

    staleHandler({ address: "GLATE", network: "mainnet", networkPassphrase: MAINNET_PASSPHRASE })
    expect(wallet.address.value).toBe("GACCOUNTONE")
    expect(wallet.walletNetwork.value).toBe("testnet")
  })

  it("moves the subscription when the connected wallet changes", async () => {
    const other = createFakeAdapter("xbull", { address: "GXBULL" })
    const { wallet } = mountConsumer(runtime)

    await wallet.connect("freighter")
    await wallet.connect("xbull")

    expect(freighter.handlers.size).toBe(0)
    expect(other.handlers.size).toBe(1)

    freighter.emit({
      address: "GFROMOLD",
      network: "mainnet",
      networkPassphrase: MAINNET_PASSPHRASE,
    })
    expect(wallet.address.value).toBe("GXBULL")
    expect(wallet.walletNetwork.value).toBe("testnet")
  })

  it("unsubscribes when the last consumer scope is disposed", async () => {
    const a = mountConsumer(runtime)
    const b = mountConsumer(runtime)
    await a.wallet.connect("freighter")

    a.unmount()
    expect(freighter.handlers.size).toBe(1)

    b.unmount()
    expect(freighter.handlers.size).toBe(0)

    // A new consumer resumes the single subscription.
    mountConsumer(runtime)
    expect(freighter.handlers.size).toBe(1)
    expect(freighter.subscribe).toHaveBeenCalledTimes(2)
  })

  it("unsubscribes when the runtime is disposed", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")

    runtime.dispose()
    expect(freighter.handlers.size).toBe(0)
  })
})

describe("refreshWalletNetwork", () => {
  let runtime: WalletRuntime
  let freighter: FakeAdapter

  beforeEach(() => {
    adapters.clear()
    freighter = createFakeAdapter("freighter")
    runtime = createWalletRuntime({ network: "testnet" })
  })

  it("updates walletNetwork from the adapter", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")

    freighter.getNetworkDetails.mockResolvedValueOnce({
      network: "mainnet",
      networkPassphrase: MAINNET_PASSPHRASE,
    })
    await wallet.refreshWalletNetwork()

    expect(freighter.getNetworkDetails).toHaveBeenLastCalledWith("testnet")
    expect(wallet.walletNetwork.value).toBe("mainnet")
    expect(wallet.walletNetworkPassphrase.value).toBe(MAINNET_PASSPHRASE)
    expect(wallet.isNetworkMismatch.value).toBe(true)
    expect(wallet.error.value).toBeNull()
  })

  it("surfaces adapter errors without dropping the connection", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")

    freighter.getNetworkDetails.mockRejectedValueOnce(new Error("extension locked"))
    await wallet.refreshWalletNetwork()

    expect(wallet.error.value).toMatchObject({ message: "extension locked" })
    expect(wallet.connected.value).toBe(true)
    expect(wallet.walletNetwork.value).toBe("testnet")
  })

  it("clears a previous error on success", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")

    freighter.getNetworkDetails.mockRejectedValueOnce(new Error("extension locked"))
    await wallet.refreshWalletNetwork()
    await wallet.refreshWalletNetwork()

    expect(wallet.error.value).toBeNull()
  })

  it("is a no-op while disconnected", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.refreshWalletNetwork()

    expect(freighter.getNetworkDetails).not.toHaveBeenCalled()
    expect(wallet.walletNetwork.value).toBeNull()
  })

  it("drops a result that resolves after disconnect", async () => {
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")

    let resolve!: (v: unknown) => void
    freighter.getNetworkDetails.mockReturnValueOnce(new Promise(r => (resolve = r)))
    const pending = wallet.refreshWalletNetwork()

    wallet.disconnect()
    resolve({ network: "mainnet", networkPassphrase: MAINNET_PASSPHRASE })
    await pending

    expect(wallet.walletNetwork.value).toBeNull()
  })
})

describe("isNetworkMismatch", () => {
  // Mirrors packages/core/src/hooks/useWallet.ts:
  //   !connected || !walletNetwork ? false : network !== walletNetwork
  const reactMismatch = (
    connected: boolean,
    network: StellarNetwork | null,
    walletNetwork: StellarNetwork | null
  ) => (!connected || !walletNetwork ? false : network !== walletNetwork)

  beforeEach(() => {
    adapters.clear()
  })

  it("is false while disconnected", () => {
    const runtime = createWalletRuntime({ network: "testnet" })
    const { wallet } = mountConsumer(runtime)

    expect(wallet.isNetworkMismatch.value).toBe(false)
    expect(wallet.isNetworkMismatch.value).toBe(reactMismatch(false, null, null))
  })

  const cases: Array<[StellarNetwork, StellarNetwork, boolean]> = [
    ["testnet", "testnet", false],
    ["testnet", "mainnet", true],
    ["mainnet", "testnet", true],
    ["testnet", "custom", true],
    ["custom", "custom", false],
    ["custom", "testnet", true],
  ]

  it.each(cases)("app on %s, wallet on %s → %s", async (appNetwork, walletNetwork, expected) => {
    createFakeAdapter("freighter", { walletNetwork, passphrase: "Some Passphrase" })
    const runtime = createWalletRuntime({ network: appNetwork })
    const { wallet } = mountConsumer(runtime)

    await wallet.connect("freighter")

    expect(wallet.isNetworkMismatch.value).toBe(expected)
    expect(wallet.isNetworkMismatch.value).toBe(reactMismatch(true, appNetwork, walletNetwork))
  })

  it("returns to false after disconnecting from a mismatched wallet", async () => {
    createFakeAdapter("freighter", { walletNetwork: "mainnet" })
    const runtime = createWalletRuntime({ network: "testnet" })
    const { wallet } = mountConsumer(runtime)

    await wallet.connect("freighter")
    expect(wallet.isNetworkMismatch.value).toBe(true)

    wallet.disconnect()
    expect(wallet.isNetworkMismatch.value).toBe(false)
  })

  it("follows network change events", async () => {
    const freighter = createFakeAdapter("freighter")
    const runtime = createWalletRuntime({ network: "testnet" })
    const { wallet } = mountConsumer(runtime)
    await wallet.connect("freighter")

    freighter.emit({ address: null, network: "mainnet", networkPassphrase: MAINNET_PASSPHRASE })
    expect(wallet.isNetworkMismatch.value).toBe(true)

    freighter.emit({ address: null, network: "testnet", networkPassphrase: TESTNET_PASSPHRASE })
    expect(wallet.isNetworkMismatch.value).toBe(false)
  })
})
