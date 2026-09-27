import { renderHook, act } from "@testing-library/react"
import { FocusManager, focusManager } from "./focusManager"
import { QueryStore } from "../cache/store"
import { usePaymentPaths } from "../hooks/usePaymentPaths"

// ── Doubles ─────────────────────────────────────────────────────────────────

jest.mock("../utils", () => ({
  ...jest.requireActual("../utils"),
  getHorizonServer: jest.fn(),
}))

let mockQueryStore = new QueryStore()

jest.mock("../context/StellarProvider", () => ({
  useStellarContext: () => ({
    network: "testnet",
    networkConfig: {
      network: "testnet",
      horizonUrl: "https://horizon-testnet.stellar.org",
      sorobanUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
    queryStore: mockQueryStore,
  }),
}))

const { getHorizonServer } = jest.requireMock("../utils") as { getHorizonServer: jest.Mock }

const call = jest.fn()
const strictSendPaths = jest.fn(() => ({ call }))

/** Testnet only. */
const USDC = {
  code: "USDC",
  issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state })
  document.dispatchEvent(new Event("visibilitychange"))
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

beforeEach(() => {
  jest.useFakeTimers()
  mockQueryStore = new QueryStore()
  call.mockReset().mockResolvedValue({ records: [] })
  getHorizonServer.mockReturnValue({ strictSendPaths })
})

afterEach(() => {
  setVisibility("visible")
  focusManager.setEventListener()
  jest.useRealTimers()
})

// ── The manager ─────────────────────────────────────────────────────────────

describe("FocusManager", () => {
  it("reads document visibility until a platform reports a state", () => {
    const manager = new FocusManager()

    setVisibility("hidden")
    expect(manager.isFocused()).toBe(false)
    setVisibility("visible")
    expect(manager.isFocused()).toBe(true)

    manager.setFocused(false)
    expect(manager.isFocused()).toBe(false)
  })

  it("notifies only when the state actually changes", () => {
    const manager = new FocusManager()
    const listener = jest.fn()
    manager.subscribe(listener)

    manager.setFocused(true) // already focused
    expect(listener).not.toHaveBeenCalled()

    manager.setFocused(false)
    manager.setFocused(false)
    expect(listener.mock.calls).toEqual([[false]])

    manager.setFocused(true)
    expect(listener.mock.calls).toEqual([[false], [true]])
  })

  it("follows visibilitychange while subscribed", () => {
    const manager = new FocusManager()
    const listener = jest.fn()
    const unsubscribe = manager.subscribe(listener)

    setVisibility("hidden")
    setVisibility("visible")
    expect(listener.mock.calls).toEqual([[false], [true]])

    unsubscribe()
    setVisibility("hidden")
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("attaches the platform signal with the first subscriber and detaches with the last", () => {
    const manager = new FocusManager()
    const cleanup = jest.fn()
    const setup = jest.fn(() => cleanup)
    manager.setEventListener(setup)
    expect(setup).not.toHaveBeenCalled()

    const a = manager.subscribe(jest.fn())
    const b = manager.subscribe(jest.fn())
    expect(setup).toHaveBeenCalledTimes(1)

    a()
    expect(cleanup).not.toHaveBeenCalled()
    b()
    expect(cleanup).toHaveBeenCalledTimes(1)
  })

  it("lets a platform replace the signal, and forgets its state when removed", () => {
    const manager = new FocusManager()
    const listener = jest.fn()
    manager.subscribe(listener)

    let report: (focused: boolean) => void = () => {}
    manager.setEventListener(setFocused => {
      report = setFocused
    })

    // The web default is detached...
    setVisibility("hidden")
    expect(listener).not.toHaveBeenCalled()
    setVisibility("visible")

    // ...and the new signal drives the state.
    report(false)
    expect(manager.isFocused()).toBe(false)

    // Restoring the default cannot leave the app stuck in the background.
    manager.setEventListener()
    expect(manager.isFocused()).toBe(true)
  })
})

// ── Quote polling ───────────────────────────────────────────────────────────

describe("usePaymentPaths polling", () => {
  function renderQuotes() {
    return renderHook(() =>
      usePaymentPaths({
        mode: "strictSend",
        sourceAsset: "XLM",
        sourceAmount: "10",
        destinationAsset: USDC,
        watch: true,
        interval: 5_000,
      })
    )
  }

  it("pauses in the background and refreshes once on return", async () => {
    renderQuotes()
    await flush()
    expect(call).toHaveBeenCalledTimes(1)

    act(() => focusManager.setFocused(false))
    await act(async () => {
      jest.advanceTimersByTime(30_000)
    })
    await flush()
    expect(call).toHaveBeenCalledTimes(1)

    act(() => focusManager.setFocused(true))
    await flush()
    expect(call).toHaveBeenCalledTimes(2)

    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })
    await flush()
    expect(call).toHaveBeenCalledTimes(3)
  })

  it("stops listening for focus once unmounted", async () => {
    const { unmount } = renderQuotes()
    await flush()
    unmount()

    act(() => focusManager.setFocused(false))
    act(() => focusManager.setFocused(true))
    await flush()
    expect(call).toHaveBeenCalledTimes(1)
  })
})
