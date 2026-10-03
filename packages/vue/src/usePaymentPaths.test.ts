import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, onScopeDispose, ref, watch } from "vue"
import { usePaymentPaths } from "./usePaymentPaths"
import { fetchPaymentPaths, paymentPathsKey, toStellarError } from "@use-stellar/core"

const networkConfig = {
  network: "testnet" as const,
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
}

const entries = new Map<string, { data: unknown; error: unknown; updatedAt: number | null }>()
const subscriptions = new Set<string>()
const store = {
  getSnapshot: (key: readonly unknown[]) => entries.get(JSON.stringify(key)),
}

vi.mock("@use-stellar/core", () => ({
  assetKeyStr: vi.fn((asset: string | { code: string; issuer: string }) =>
    typeof asset === "string" ? "native" : `${asset.code}:${asset.issuer}`
  ),
  paymentPathsKey: vi.fn((...parts: unknown[]) => ["paymentPaths", ...parts]),
  fetchPaymentPaths: vi.fn(),
  toStellarError: vi.fn((error: unknown) => error),
}))

vi.mock("./useStellar", () => ({
  useStellar: () => ({
    snapshot: { network: "testnet", networkConfig },
    runtime: { getQueryStore: () => store },
  }),
}))

vi.mock("./useQuery", () => ({
  useQuery: ({ queryKey, queryFn, enabled }: {
    queryKey: { value: readonly unknown[] }
    queryFn: () => Promise<unknown>
    enabled: { value: boolean }
  }) => {
    const data = ref<unknown>(null)
    const loading = ref(false)
    const error = ref<unknown>(null)
    const updatedAt = ref<number | null>(null)
    let currentKey = ""

    const load = async () => {
      if (!enabled.value) return
      const key = JSON.stringify(queryKey.value)
      loading.value = true
      error.value = null
      try {
        const result = await queryFn()
        entries.set(key, { data: result, error: null, updatedAt: Date.now() })
        data.value = result
        updatedAt.value = Date.now()
      } catch (cause) {
        entries.set(key, { data: null, error: cause, updatedAt: null })
        error.value = cause
      } finally {
        loading.value = false
      }
    }

    watch(
      () => [JSON.stringify(queryKey.value), enabled.value] as const,
      ([key, active]) => {
        subscriptions.delete(currentKey)
        currentKey = key
        data.value = entries.get(key)?.data ?? null
        error.value = entries.get(key)?.error ?? null
        updatedAt.value = entries.get(key)?.updatedAt ?? null
        if (active) {
          subscriptions.add(key)
          void load()
        }
      },
      { immediate: true }
    )
    onScopeDispose(() => subscriptions.delete(currentKey))
    return { data, loading, error, updatedAt, refetch: () => void load() }
  },
}))

const usdc = { code: "USDC", issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" }
const quote = {
  paths: [{ path: [], sourceAmount: "10", destinationAmount: "9", rate: "0.9" }],
  lastUpdated: new Date("2026-01-01T00:00:00Z"),
}

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

beforeEach(() => {
  entries.clear()
  subscriptions.clear()
  vi.clearAllMocks()
  vi.mocked(fetchPaymentPaths).mockResolvedValue(quote)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("usePaymentPaths", () => {
  it("resolves static, ref, and getter inputs into the React cache key", async () => {
    const amount = ref("10")
    const scope = effectScope()
    const result = scope.run(() => usePaymentPaths({
      mode: "strictSend",
      sourceAsset: "XLM",
      destinationAsset: () => usdc,
      sourceAmount: amount,
    }))!

    await settle()
    expect(vi.mocked(paymentPathsKey)).toHaveBeenCalledWith(
      networkConfig.horizonUrl, "testnet", "strictSend", "native",
      `${usdc.code}:${usdc.issuer}`, "10", undefined
    )
    expect(result.paths.value).toEqual(quote.paths)
    expect(result.lastUpdated.value).toEqual(quote.lastUpdated)
    expect(result.loading.value).toBe(false)
    expect(result.error.value).toBeNull()
    expect(vi.mocked(fetchPaymentPaths)).toHaveBeenCalledWith(networkConfig, {
      mode: "strictSend", sourceAsset: "XLM", destinationAsset: usdc,
      sourceAmount: "10", destinationAddress: undefined,
    })
    scope.stop()
  })

  it("moves to the new key when a getter changes and releases the old subscription", async () => {
    const amount = ref("10")
    const scope = effectScope()
    const result = scope.run(() => usePaymentPaths({
      mode: "strictReceive", sourceAsset: "XLM", destinationAsset: usdc,
      destinationAmount: () => amount.value,
    }))!
    await settle()
    const previousKey = [...subscriptions][0]

    amount.value = "20"
    await settle()
    expect(subscriptions.has(previousKey)).toBe(false)
    expect([...subscriptions][0]).toContain("20")
    expect(result.paths.value).toEqual(quote.paths)
    expect(vi.mocked(fetchPaymentPaths)).toHaveBeenLastCalledWith(networkConfig, {
      mode: "strictReceive", sourceAsset: "XLM", destinationAsset: usdc,
      destinationAmount: "20", sourceAddress: undefined,
    })

    scope.stop()
    expect(subscriptions.size).toBe(0)
  })

  it("returns the shared fetcher's ranked paths and rates in both modes", async () => {
    const ranked = {
      paths: [
        { path: [], sourceAmount: "10", destinationAmount: "9", rate: "0.9" },
        { path: [usdc], sourceAmount: "10", destinationAmount: "8.5", rate: "0.85" },
      ],
      lastUpdated: quote.lastUpdated,
    }
    vi.mocked(fetchPaymentPaths).mockResolvedValue(ranked)
    const scope = effectScope()
    const results = scope.run(() => ({
      send: usePaymentPaths({
        mode: "strictSend", sourceAsset: "XLM", destinationAsset: usdc,
        sourceAmount: "10",
      }),
      receive: usePaymentPaths({
        mode: "strictReceive", sourceAsset: "XLM", destinationAsset: usdc,
        destinationAmount: "9",
      }),
    }))!

    await settle()
    expect(results.send.paths.value).toEqual(ranked.paths)
    expect(results.receive.paths.value).toEqual(ranked.paths)
    expect(results.send.paths.value.map(path => path.rate)).toEqual(["0.9", "0.85"])
    scope.stop()
  })

  it("keeps empty input idle and maps fetch failures to StellarError", async () => {
    const amount = ref<string | null>(null)
    const scope = effectScope()
    const result = scope.run(() => usePaymentPaths({
      mode: "strictSend", sourceAsset: "XLM", destinationAsset: usdc,
      sourceAmount: amount,
    }))!
    await settle()
    expect(fetchPaymentPaths).not.toHaveBeenCalled()
    expect(result.paths.value).toEqual([])
    expect(result.loading.value).toBe(false)
    expect(result.error.value).toBeNull()

    const failure = Object.assign(new Error("Horizon unavailable"), { code: "NETWORK_ERROR" })
    vi.mocked(fetchPaymentPaths).mockRejectedValueOnce(failure)
    amount.value = "10"
    await settle()
    expect(toStellarError).toHaveBeenCalledWith(failure)
    expect(result.error.value).toBe(failure)
    scope.stop()
  })

  it("polls only while watch and enabled are true, then stops on disposal", async () => {
    vi.useFakeTimers()
    const enabled = ref(true)
    const watching = ref(true)
    const scope = effectScope()
    scope.run(() => usePaymentPaths({
      mode: "strictSend", sourceAsset: "XLM", destinationAsset: usdc,
      sourceAmount: "10", enabled, watch: watching, interval: 100,
    }))
    await settle()
    const initial = vi.mocked(fetchPaymentPaths).mock.calls.length
    await vi.advanceTimersByTimeAsync(100)
    expect(fetchPaymentPaths).toHaveBeenCalledTimes(initial + 1)

    watching.value = false
    await settle()
    await vi.advanceTimersByTimeAsync(200)
    expect(fetchPaymentPaths).toHaveBeenCalledTimes(initial + 1)

    watching.value = true
    enabled.value = false
    await settle()
    await vi.advanceTimersByTimeAsync(200)
    expect(fetchPaymentPaths).toHaveBeenCalledTimes(initial + 1)

    enabled.value = true
    await settle()
    scope.stop()
    const atDisposal = vi.mocked(fetchPaymentPaths).mock.calls.length
    await vi.advanceTimersByTimeAsync(200)
    expect(fetchPaymentPaths).toHaveBeenCalledTimes(atDisposal)
  })
})
