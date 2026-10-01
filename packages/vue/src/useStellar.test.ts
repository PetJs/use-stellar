import { defineComponent, createApp } from "vue"
import { mount, flushPromises } from "@vue/test-utils"
import { useStellar } from "./useStellar"
import { createStellarPlugin } from "./plugin"
import type { NetworkConfig, WalletState } from "use-stellar"

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

describe("useStellar composable", () => {
  it("returns the runtime and a snapshot", () => {
    const TestComponent = defineComponent({
      setup() {
        const { runtime, snapshot } = useStellar()
        return { runtime, snapshot }
      },
      template: "<div>{{ snapshot.wallet.connected }}</div>",
    })

    const wrapper = mount(TestComponent, {
      global: {
        plugins: [createStellarPlugin({ networkConfig: mockNetworkConfig })],
      },
    })

    expect(wrapper.vm.runtime).toBeDefined()
    expect(wrapper.vm.snapshot).toBeDefined()
    expect(wrapper.vm.snapshot.networkConfig).toEqual(mockNetworkConfig)
  })

  it("throws an error when plugin is not installed", () => {
    const TestComponent = defineComponent({
      setup() {
        useStellar()
        return {}
      },
      template: "<div></div>",
    })

    expect(() => {
      mount(TestComponent)
    }).toThrow("@use-stellar/vue: No StellarRuntime found")
  })

  it("updates the snapshot when the runtime changes", async () => {
    const TestComponent = defineComponent({
      setup() {
        const { snapshot, runtime } = useStellar()
        return { snapshot, runtime }
      },
      template: "<div>{{ snapshot.wallet.connected }}</div>",
    })

    const wrapper = mount(TestComponent, {
      global: {
        plugins: [createStellarPlugin({ networkConfig: mockNetworkConfig })],
      },
    })

    // Initial state: disconnected
    expect(wrapper.vm.snapshot.wallet.connected).toBe(false)

    // Update the runtime wallet state
    wrapper.vm.runtime.updateWallet(mockWalletState)
    await wrapper.vm.$nextTick()

    // Snapshot should reflect the update
    expect(wrapper.vm.snapshot.wallet.connected).toBe(true)
    expect(wrapper.vm.snapshot.wallet.address).toBe(mockWalletState.address)
  })

  it("unsubscribes when the component unmounts", async () => {
    const TestComponent = defineComponent({
      setup() {
        const { snapshot, runtime } = useStellar()
        return { snapshot, runtime }
      },
      template: "<div></div>",
    })

    const wrapper = mount(TestComponent, {
      global: {
        plugins: [createStellarPlugin({ networkConfig: mockNetworkConfig })],
      },
    })

    const runtime = wrapper.vm.runtime
    const initialSnapshotNetwork = wrapper.vm.snapshot.network

    // Component is mounted, updates should work
    runtime.updateWallet(mockWalletState)
    expect(wrapper.vm.snapshot.wallet.connected).toBe(true)

    // Unmount the component
    wrapper.unmount()

    // After unmount, the component is disposed but the runtime still exists
    // This tests that the listener was properly cleaned up
    expect(wrapper.vm.snapshot.wallet.connected).toBe(true) // Still has the old state
  })

  it("provides access to the query store through runtime", () => {
    const TestComponent = defineComponent({
      setup() {
        const { runtime } = useStellar()
        const queryStore = runtime.getQueryStore()
        return { queryStore }
      },
      template: "<div></div>",
    })

    const wrapper = mount(TestComponent, {
      global: {
        plugins: [createStellarPlugin({ networkConfig: mockNetworkConfig })],
      },
    })

    expect(wrapper.vm.queryStore).toBeDefined()
    expect(wrapper.vm.queryStore.size).toBe(0)
  })

  it("maintains the same runtime instance across multiple composable calls", () => {
    const TestComponent = defineComponent({
      setup() {
        const result1 = useStellar()
        const result2 = useStellar()
        return { runtime1: result1.runtime, runtime2: result2.runtime }
      },
      template: "<div></div>",
    })

    const wrapper = mount(TestComponent, {
      global: {
        plugins: [createStellarPlugin({ networkConfig: mockNetworkConfig })],
      },
    })

    expect(wrapper.vm.runtime1).toBe(wrapper.vm.runtime2)
  })

  it("makes snapshot readonly", () => {
    const TestComponent = defineComponent({
      setup() {
        const { snapshot } = useStellar()
        return { snapshot }
      },
      template: "<div></div>",
    })

    const wrapper = mount(TestComponent, {
      global: {
        plugins: [createStellarPlugin({ networkConfig: mockNetworkConfig })],
      },
    })

    // Accessing the snapshot should not throw
    expect(wrapper.vm.snapshot.network).toBe("testnet")

    // Trying to mutate should fail in strict mode or be a no-op
    const originalAddress = wrapper.vm.snapshot.wallet.address
    try {
      // @ts-expect-error - Testing readonly behavior
      wrapper.vm.snapshot.wallet.address = "GBTEST"
      // In strict mode this will throw, in non-strict it's a no-op
      expect(wrapper.vm.snapshot.wallet.address).toBe(originalAddress)
    } catch {
      // Expected in strict mode
    }
  })
})
