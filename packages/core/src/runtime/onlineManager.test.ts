import { act, renderHook } from "@testing-library/react"
import { SorobanRpc } from "@stellar/stellar-sdk"
import { OnlineManager, offlineError, onlineManager } from "./onlineManager"
import { QueryStore } from "../cache/store"
import { useBalance } from "../hooks/useBalance"
import { useContractEvents } from "../hooks/useContractEvents"
import { useSendPayment } from "../hooks/useSendPayment"
import { usePathPayment } from "../hooks/usePathPayment"
import { useAddTrustline } from "../hooks/useAddTrustline"
import { useCreateAccount } from "../hooks/useCreateAccount"
import { useSorobanWrite } from "../hooks/useSorobanWrite"
import { useManageOffer } from "../hooks/useManagerOffer"
import { useLiquidityPoolActions } from "../hooks/useLiquidityPoolActions"
import type { WalletState } from "../types"

// ── Doubles ─────────────────────────────────────────────────────────────────

jest.mock("../wallets", () => ({ getWalletAdapter: jest.fn() }))

jest.mock("../utils", () => ({
  ...jest.requireActual("../utils"),
  getHorizonServer: jest.fn(),
  isBrowser: () => true,
}))

/** Testnet only. */
const ADDRESS = "GDX76CSVSJMYE7PMG2JI7CMERG4CK3UNKX4G6SXZJCY2NLJEWXA2XRSS"
const DESTINATION = "GDHHCCQQFR6THLXLZQWVU545C4IN42CZ2A3IPYHYMI4LKELGMWAPP7ZR"
const CONTRACT = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"

let mockQueryStore = new QueryStore()
const mockWallet: WalletState = {
  connected: true,
  address: ADDRESS,
  network: "testnet",
  wallet: "freighter",
  connecting: false,
  error: null,
  walletNetwork: "testnet",
  walletName: "Freighter",
}

jest.mock("../context/StellarProvider", () => ({
  useStellarContext: () => ({
    network: "testnet",
    networkConfig: {
      network: "testnet",
      horizonUrl: "https://horizon-testnet.stellar.org",
      sorobanUrl: "https://soroban-testnet.stellar.org",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
    wallet: mockWallet,
    setWallet: jest.fn(),
    queryStore: mockQueryStore,
    autoConnect: { enabled: false, persistAddress: false, storage: "local" as const },
  }),
}))

const { getHorizonServer } = jest.requireMock("../utils") as { getHorizonServer: jest.Mock }
const { getWalletAdapter } = jest.requireMock("../wallets") as { getWalletAdapter: jest.Mock }
// The manual SDK mock (mapped in jest.config.js) exposes `SorobanRpc.Server`
// as a jest.fn(); point it at a stub with `getEvents`.
const RpcServer = SorobanRpc.Server as unknown as jest.Mock

const loadAccount = jest.fn()
const submitTransaction = jest.fn()
const signTransaction = jest.fn()
const getEvents = jest.fn()

const account = {
  id: ADDRESS,
  accountId: () => ADDRESS,
  sequenceNumber: () => "100",
  incrementSequenceNumber: () => {},
  subentry_count: 0,
  thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
  signers: [],
  balances: [{ asset_type: "native", balance: "100.0000000" }],
}

/** Settles pending promises under fake timers. */
async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve()
  })
}

async function goOffline() {
  await act(async () => {
    window.dispatchEvent(new Event("offline"))
  })
}

async function goOnline() {
  await act(async () => {
    window.dispatchEvent(new Event("online"))
  })
  await flush()
}

beforeEach(() => {
  jest.useFakeTimers()
  mockQueryStore = new QueryStore()
  loadAccount.mockReset().mockResolvedValue(account)
  submitTransaction.mockReset()
  signTransaction.mockReset()
  getEvents.mockReset().mockResolvedValue({ events: [], latestLedger: 1000 })
  getHorizonServer.mockReturnValue({ loadAccount, submitTransaction })
  getWalletAdapter.mockReturnValue({ signTransaction })
  RpcServer.mockImplementation(() => ({
    getLatestLedger: jest.fn().mockResolvedValue({ sequence: 1000 }),
    getEvents,
  }))
})

afterEach(() => {
  onlineManager.setOnline(true)
  jest.useRealTimers()
})

// ── The manager ─────────────────────────────────────────────────────────────

describe("OnlineManager", () => {
  it("reads navigator.onLine until a platform reports a state", () => {
    const manager = new OnlineManager()
    const spy = jest.spyOn(window.navigator, "onLine", "get")

    spy.mockReturnValue(false)
    expect(manager.isOnline()).toBe(false)
    spy.mockReturnValue(true)
    expect(manager.isOnline()).toBe(true)

    // Once set, the reported state wins over navigator.
    manager.setOnline(false)
    expect(manager.isOnline()).toBe(false)

    spy.mockRestore()
  })

  it("notifies only when the state actually changes", () => {
    const manager = new OnlineManager()
    const listener = jest.fn()
    manager.subscribe(listener)

    manager.setOnline(true) // already online
    expect(listener).not.toHaveBeenCalled()

    manager.setOnline(false)
    manager.setOnline(false)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(false)

    manager.setOnline(true)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenLastCalledWith(true)
  })

  it("follows window online/offline events while subscribed", () => {
    const manager = new OnlineManager()
    const listener = jest.fn()
    const unsubscribe = manager.subscribe(listener)

    window.dispatchEvent(new Event("offline"))
    expect(manager.isOnline()).toBe(false)
    window.dispatchEvent(new Event("online"))
    expect(manager.isOnline()).toBe(true)
    expect(listener.mock.calls).toEqual([[false], [true]])

    unsubscribe()
    window.dispatchEvent(new Event("offline"))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it("attaches the platform signal with the first subscriber and detaches with the last", () => {
    const manager = new OnlineManager()
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

  it("lets a platform replace the signal while subscribed", () => {
    const manager = new OnlineManager()
    const listener = jest.fn()
    manager.subscribe(listener)

    let report: (online: boolean) => void = () => {}
    manager.setEventListener(setOnline => {
      report = setOnline
    })

    // The web default is detached...
    window.dispatchEvent(new Event("offline"))
    expect(listener).not.toHaveBeenCalled()

    // ...and the new signal drives the state.
    report(false)
    expect(manager.isOnline()).toBe(false)
    expect(listener).toHaveBeenCalledWith(false)
  })

  it("offlineError is a NETWORK_ERROR that says nothing was signed", () => {
    const error = offlineError()
    expect(error.code).toBe("NETWORK_ERROR")
    expect(error.message).toMatch(/offline/i)
    expect(error.message).toMatch(/nothing was signed or submitted/i)
  })
})

// ── Queries ─────────────────────────────────────────────────────────────────

describe("queries while offline", () => {
  it("pauses polling without clearing data", async () => {
    const { result } = renderHook(() =>
      useBalance({ address: ADDRESS, watch: true, interval: 5_000 })
    )
    await flush()
    expect(loadAccount).toHaveBeenCalledTimes(1)
    expect(result.current.balance).toBe("100.0000000")

    await goOffline()
    await act(async () => {
      jest.advanceTimersByTime(30_000)
    })
    await flush()

    expect(loadAccount).toHaveBeenCalledTimes(1)
    expect(result.current.balance).toBe("100.0000000")
    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it("skips an explicit refetch", async () => {
    const { result } = renderHook(() => useBalance({ address: ADDRESS }))
    await flush()

    await goOffline()
    await act(async () => {
      result.current.refetch()
    })
    await flush()

    expect(loadAccount).toHaveBeenCalledTimes(1)
  })

  it("does not fetch on mount, then fetches once on reconnect", async () => {
    onlineManager.setOnline(false)
    const { result } = renderHook(() => useBalance({ address: ADDRESS }))
    await flush()
    expect(loadAccount).not.toHaveBeenCalled()
    expect(result.current.error).toBeNull()

    await goOnline()
    expect(loadAccount).toHaveBeenCalledTimes(1)
    expect(result.current.balance).toBe("100.0000000")
  })

  it("keeps data and surfaces no error when the connection drops mid-request", async () => {
    const { result } = renderHook(() => useBalance({ address: ADDRESS }))
    await flush()
    const lastUpdated = result.current.lastUpdated

    let reject: (err: unknown) => void = () => {}
    loadAccount.mockReturnValueOnce(new Promise((_, r) => (reject = r)))
    await act(async () => {
      result.current.refetch()
    })
    expect(result.current.loading).toBe(true)

    await goOffline()
    await act(async () => {
      reject(new Error("Network Error"))
    })
    await flush()

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.balance).toBe("100.0000000")
    expect(result.current.lastUpdated).toBe(lastUpdated)
  })

  it("still surfaces a genuine error while online", async () => {
    loadAccount.mockRejectedValueOnce(new Error("Network Error"))
    const { result } = renderHook(() => useBalance({ address: ADDRESS }))
    await flush()

    expect(result.current.error?.code).toBe("NETWORK_ERROR")
  })
})

describe("queries on reconnect", () => {
  it("refetches a stale query exactly once, however many hooks share it", async () => {
    renderHook(() => ({
      a: useBalance({ address: ADDRESS, staleTime: 0 }),
      b: useBalance({ address: ADDRESS, staleTime: 0 }),
      c: useBalance({ address: ADDRESS, staleTime: 0 }),
    }))
    await flush()
    expect(loadAccount).toHaveBeenCalledTimes(1)

    await goOffline()
    await goOnline()
    expect(loadAccount).toHaveBeenCalledTimes(2)

    // A repeated `online` event is not a reconnect.
    await goOnline()
    expect(loadAccount).toHaveBeenCalledTimes(2)
  })

  it("does not refetch data that is still fresh", async () => {
    renderHook(() => useBalance({ address: ADDRESS, staleTime: 60_000 }))
    await flush()

    await goOffline()
    await goOnline()

    expect(loadAccount).toHaveBeenCalledTimes(1)
  })

  it("resumes polling after reconnect", async () => {
    renderHook(() => useBalance({ address: ADDRESS, watch: true, interval: 5_000 }))
    await flush()

    await goOffline()
    await act(async () => {
      jest.advanceTimersByTime(10_000)
    })
    await goOnline()
    const afterReconnect = loadAccount.mock.calls.length

    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })
    await flush()
    expect(loadAccount).toHaveBeenCalledTimes(afterReconnect + 1)
  })

  it("stops listening once unmounted", async () => {
    const { unmount } = renderHook(() => useBalance({ address: ADDRESS, staleTime: 0 }))
    await flush()
    unmount()

    await goOffline()
    await goOnline()
    expect(loadAccount).toHaveBeenCalledTimes(1)
  })
})

// ── Contract-event polling ──────────────────────────────────────────────────

describe("useContractEvents while offline", () => {
  it("pauses polling, keeps no error, and polls once on reconnect", async () => {
    const { result } = renderHook(() =>
      useContractEvents({ contractIds: [CONTRACT], interval: 5_000 })
    )
    await flush()
    expect(getEvents).toHaveBeenCalledTimes(1)

    await goOffline()
    await act(async () => {
      jest.advanceTimersByTime(20_000)
    })
    await flush()
    expect(getEvents).toHaveBeenCalledTimes(1)

    await goOnline()
    expect(getEvents).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })

  it("does not surface an error when the connection drops mid-poll", async () => {
    const { result } = renderHook(() =>
      useContractEvents({ contractIds: [CONTRACT], interval: 5_000 })
    )
    await flush()

    let reject: (err: unknown) => void = () => {}
    getEvents.mockReturnValueOnce(new Promise((_, r) => (reject = r)))
    await act(async () => {
      jest.advanceTimersByTime(5_000)
    })

    await goOffline()
    await act(async () => {
      reject(new Error("Network Error"))
    })
    await flush()

    expect(result.current.error).toBeNull()
    expect(result.current.loading).toBe(false)
  })
})

// ── Write actions ───────────────────────────────────────────────────────────

describe("write actions while offline", () => {
  beforeEach(() => {
    onlineManager.setOnline(false)
  })

  /** Nothing was loaded, signed, or submitted. */
  function expectNothingSent() {
    expect(loadAccount).not.toHaveBeenCalled()
    expect(signTransaction).not.toHaveBeenCalled()
    expect(submitTransaction).not.toHaveBeenCalled()
  }

  it("useSendPayment fails fast", async () => {
    const { result } = renderHook(() => useSendPayment())
    await expect(
      result.current.send({ to: DESTINATION, asset: "XLM", amount: "1" })
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" })
    expectNothingSent()
  })

  it("usePathPayment fails fast", async () => {
    const { result } = renderHook(() => usePathPayment())
    await expect(
      result.current.pathPayment({
        mode: "strictSend",
        destination: DESTINATION,
        sendAsset: "XLM",
        sendAmount: "1",
        destAsset: "XLM",
        destMin: "1",
        path: [],
      })
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" })
    expectNothingSent()
  })

  it("useAddTrustline fails fast", async () => {
    const { result } = renderHook(() => useAddTrustline())
    await expect(
      result.current.addTrustline({ asset: { code: "USDC", issuer: DESTINATION } })
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" })
    expectNothingSent()
  })

  it("useCreateAccount fails fast", async () => {
    const { result } = renderHook(() => useCreateAccount())
    await act(async () => {
      await expect(
        result.current.createAccount({ destination: DESTINATION, startingBalance: "2" })
      ).rejects.toMatchObject({ code: "NETWORK_ERROR" })
    })
    expect(result.current.error?.code).toBe("NETWORK_ERROR")
    expectNothingSent()
  })

  it("useSorobanWrite fails fast", async () => {
    const { result } = renderHook(() => useSorobanWrite())
    await act(async () => {
      await expect(
        result.current.invoke({ contractId: CONTRACT, method: "transfer" })
      ).rejects.toMatchObject({ code: "NETWORK_ERROR" })
    })
    expect(result.current.error?.code).toBe("NETWORK_ERROR")
    expectNothingSent()
  })

  it("useManageOffer fails fast", async () => {
    const { result } = renderHook(() => useManageOffer())
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.createOffer({
        selling: "XLM",
        buying: { code: "USDC", issuer: DESTINATION },
        amount: "1",
        price: "1",
        side: "sell",
      })
    })
    expect(outcome).toBeNull()
    expect(result.current.error?.code).toBe("NETWORK_ERROR")
    expectNothingSent()
  })

  it("useLiquidityPoolActions fails fast", async () => {
    const { result } = renderHook(() => useLiquidityPoolActions())
    let outcome: unknown
    await act(async () => {
      outcome = await result.current.withdraw({
        poolId: "dd7b1ab831c273310ddbec6f97870aa83c2fbd78ce22aded37ecbf4f3380fac7",
        amount: "1",
        minAmountA: "0.1",
        minAmountB: "0.1",
      })
    })
    expect(outcome).toBeNull()
    expect(result.current.error?.code).toBe("NETWORK_ERROR")
    expectNothingSent()
  })

  it("never queues: reconnecting does not submit anything", async () => {
    const { result } = renderHook(() => useSendPayment())
    await expect(
      result.current.send({ to: DESTINATION, asset: "XLM", amount: "1" })
    ).rejects.toMatchObject({ code: "NETWORK_ERROR" })

    await goOnline()
    await act(async () => {
      jest.advanceTimersByTime(60_000)
    })
    await flush()

    expectNothingSent()
  })
})
