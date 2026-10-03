import { createStellarRuntime } from "./StellarRuntime"
import type { NetworkConfig, WalletState } from "../types"

const mockNetworkConfig: NetworkConfig = {
  network: "testnet",
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
}

const mockWalletState: WalletState = {
  connected: true,
  connecting: false,
  address: "GBUQWP3BOUZX34ULNQG23RQ6F4BVWCIBTBTK7D5IMCT7WMPXJVTJJXRK",
  network: "testnet",
  wallet: "freighter",
  walletName: "Freighter",
  error: null,
  walletNetwork: "testnet",
  walletNetworkPassphrase: "Test SDF Network ; September 2015",
}

describe("StellarRuntime", () => {
  it("creates a runtime with initial state", () => {
    const runtime = createStellarRuntime({
      networkConfig: mockNetworkConfig,
    })

    const snapshot = runtime.getSnapshot()
    expect(snapshot.networkConfig).toEqual(mockNetworkConfig)
    expect(snapshot.wallet.connected).toBe(false)
  })

  it("returns immutable snapshots", () => {
    const runtime = createStellarRuntime({
      networkConfig: mockNetworkConfig,
    })

    const snapshot1 = runtime.getSnapshot()
    const snapshot2 = runtime.getSnapshot()

    expect(snapshot1).not.toBe(snapshot2) // Different objects
    expect(snapshot1).toEqual(snapshot2) // Same content
  })

  it("updates wallet state and notifies subscribers", () => {
    const runtime = createStellarRuntime({
      networkConfig: mockNetworkConfig,
    })

    const listener = jest.fn()
    runtime.subscribe(listener)

    runtime.updateWallet(mockWalletState)

    expect(listener).toHaveBeenCalledTimes(1)
    const snapshot = listener.mock.calls[0][0]
    expect(snapshot.wallet).toEqual(mockWalletState)
  })

  it("notifies all subscribers exactly once per update", () => {
    const runtime = createStellarRuntime({
      networkConfig: mockNetworkConfig,
    })

    const listener1 = jest.fn()
    const listener2 = jest.fn()
    runtime.subscribe(listener1)
    runtime.subscribe(listener2)

    runtime.updateWallet(mockWalletState)

    expect(listener1).toHaveBeenCalledTimes(1)
    expect(listener2).toHaveBeenCalledTimes(1)
  })

  it("unsubscribes correctly", () => {
    const runtime = createStellarRuntime({
      networkConfig: mockNetworkConfig,
    })

    const listener = jest.fn()
    const unsubscribe = runtime.subscribe(listener)

    runtime.updateWallet(mockWalletState)
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()

    runtime.updateWallet({
      ...mockWalletState,
      address: "GBECVXWAGVYAZGYOFQRTKXZLPELX3RMIQVFMVJ5FTZ47F7CLLSUNQTE",
    })
    expect(listener).toHaveBeenCalledTimes(1) // Not called again
  })

  it("updates network configuration", () => {
    const runtime = createStellarRuntime({
      networkConfig: mockNetworkConfig,
    })

    const listener = jest.fn()
    runtime.subscribe(listener)

    const newNetworkConfig: NetworkConfig = {
      ...mockNetworkConfig,
      network: "mainnet",
      horizonUrl: "https://horizon.stellar.org",
    }

    runtime.updateNetwork(newNetworkConfig)

    expect(listener).toHaveBeenCalledTimes(1)
    const snapshot = listener.mock.calls[0][0]
    expect(snapshot.networkConfig.network).toBe("mainnet")
  })

  it("provides access to the query store", () => {
    const runtime = createStellarRuntime({
      networkConfig: mockNetworkConfig,
      queryConfig: { staleTime: 60000 },
    })

    const queryStore = runtime.getQueryStore()
    expect(queryStore).toBeDefined()
    expect(queryStore.size).toBe(0)
  })

  it("maintains the same query store instance across calls", () => {
    const runtime = createStellarRuntime({
      networkConfig: mockNetworkConfig,
    })

    const store1 = runtime.getQueryStore()
    const store2 = runtime.getQueryStore()

    expect(store1).toBe(store2)
  })

  it("does not notify listeners when no changes are made", () => {
    const runtime = createStellarRuntime({
      networkConfig: mockNetworkConfig,
    })

    const listener = jest.fn()
    runtime.subscribe(listener)

    // Just getting the snapshot should not notify
    runtime.getSnapshot()
    expect(listener).not.toHaveBeenCalled()
  })
})
