import { beforeEach, describe, expect, it, vi } from "vitest"
import { effectScope, nextTick, ref } from "vue"
import { useAsset } from "./useAsset"
import { fetchAsset, assetKey, toStellarError } from "@use-stellar/core"

const { networkConfig, entries, subscriptions, store } = vi.hoisted(() => {
  const networkConfig = {
    network: "testnet" as const,
    horizonUrl: "https://horizon-testnet.stellar.org",
    sorobanUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
  }
  const entries = new Map<string, { data: unknown; error: unknown; updatedAt: number | null }>()
  const subscriptions = new Set<string>()
  const store = { getSnapshot: (key: readonly unknown[]) => entries.get(JSON.stringify(key)) }
  return { networkConfig, entries, subscriptions, store }
})

vi.mock("@use-stellar/core", () => ({
  assetKey: vi.fn((...parts: unknown[]) => ["asset", ...parts]),
  fetchAsset: vi.fn(),
  toStellarError: vi.fn((error: unknown) => error),
  createStellarError: vi.fn((code: string, message: string) => ({ code, message })),
  isValidAssetCode: vi.fn((code: string) => /^[a-zA-Z0-9]{1,12}$/.test(code)),
  isValidStellarAddress: vi.fn((address: string) => /^G[A-Z0-9]{55}$/.test(address)),
}))

vi.mock("./useStellar", () => ({
  useStellar: () => ({
    snapshot: { network: networkConfig.network, networkConfig },
    runtime: { getQueryStore: () => store },
  }),
}))

vi.mock("./useQuery", async () => {
  const { ref, watch, onScopeDispose } = await import("vue")
  return {
    useQuery: ({
      queryKey,
      queryFn,
      enabled,
    }: {
      queryKey: { value: readonly unknown[] }
      queryFn: () => Promise<unknown>
      enabled: { value: boolean }
    }) => {
      const data = ref<unknown>(null)
      const loading = ref(false)
      const error = ref<unknown>(null)
      const updatedAt = ref<number | null>(null)
      let currentKey = ""

      const load = async (force = false) => {
        if (!force && !enabled.value) return
        const key = JSON.stringify(queryKey.value)
        const cached = entries.get(key)
        if (!force && cached && cached.updatedAt !== null) {
          data.value = cached.data
          error.value = cached.error
          updatedAt.value = cached.updatedAt
          return
        }
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
          const cached = entries.get(key)
          data.value = cached?.data ?? null
          error.value = cached?.error ?? null
          updatedAt.value = cached?.updatedAt ?? null
          if (active) {
            subscriptions.add(key)
            void load()
          }
        },
        { immediate: true }
      )
      onScopeDispose(() => subscriptions.delete(currentKey))

      return { data, loading, error, updatedAt, refetch: () => void load(true) }
    },
  }
})

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"
const validAsset = { code: "USDC", issuer: USDC_ISSUER }
const assetInfo = {
  code: "USDC",
  issuer: USDC_ISSUER,
  supply: "1000",
  numAccounts: 10,
  homeDomain: "stellar.org",
  flags: { authRequired: false, authRevocable: false, authImmutable: true },
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
  vi.mocked(fetchAsset).mockResolvedValue(assetInfo)
})

describe("useAsset", () => {
  it("resolves static input into the shared React cache key", async () => {
    const scope = effectScope()
    const result = scope.run(() => useAsset({ ...validAsset }))!

    await settle()
    expect(vi.mocked(assetKey)).toHaveBeenCalledWith(
      networkConfig.horizonUrl,
      "testnet",
      "USDC",
      USDC_ISSUER
    )
    expect(vi.mocked(fetchAsset)).toHaveBeenCalledWith(networkConfig, {
      code: "USDC",
      issuer: USDC_ISSUER,
    })
    expect(result.asset.value).toEqual(assetInfo)
    expect(result.loading.value).toBe(false)
    expect(result.error.value).toBeNull()
    scope.stop()
  })

  it("resolves ref and getter inputs and reloads when they change", async () => {
    const code = ref("USDC")
    const scope = effectScope()
    const result = scope.run(() => useAsset({ code, issuer: () => USDC_ISSUER }))!
    await settle()
    expect(result.asset.value).toEqual(assetInfo)

    const updated = { ...assetInfo, supply: "2000" }
    vi.mocked(fetchAsset).mockResolvedValueOnce(updated)
    code.value = "EURT"
    await settle()

    expect(vi.mocked(assetKey)).toHaveBeenLastCalledWith(
      networkConfig.horizonUrl,
      "testnet",
      "EURT",
      USDC_ISSUER
    )
    expect(vi.mocked(fetchAsset)).toHaveBeenLastCalledWith(networkConfig, {
      code: "EURT",
      issuer: USDC_ISSUER,
    })
    expect(result.asset.value).toEqual(updated)
    scope.stop()
  })

  it("stays idle for null or empty input", async () => {
    const scope = effectScope()
    const result = scope.run(() => useAsset({ code: null, issuer: "" }))!

    await settle()
    expect(vi.mocked(assetKey)).not.toHaveBeenCalled()
    expect(vi.mocked(fetchAsset)).not.toHaveBeenCalled()
    expect(result.asset.value).toBeNull()
    expect(result.loading.value).toBe(false)
    expect(result.error.value).toBeNull()
    scope.stop()
  })

  it("validates the asset code and issuer before requesting", async () => {
    const scope = effectScope()
    const result = scope.run(() => useAsset({ code: "BAD CODE!", issuer: "not-a-public-key" }))!

    await settle()
    expect(vi.mocked(assetKey)).not.toHaveBeenCalled()
    expect(vi.mocked(fetchAsset)).not.toHaveBeenCalled()
    expect(result.asset.value).toBeNull()
    expect(result.loading.value).toBe(false)
    expect(result.error.value).toMatchObject({ code: "VALIDATION_ERROR" })
    scope.stop()
  })

  it("honours autoFetch: false but refreshes on refetch()", async () => {
    const scope = effectScope()
    const result = scope.run(() => useAsset({ ...validAsset, autoFetch: false }))!

    await settle()
    expect(vi.mocked(fetchAsset)).not.toHaveBeenCalled()
    expect(result.asset.value).toBeNull()
    expect(result.error.value).toBeNull()

    result.refetch()
    await settle()
    expect(vi.mocked(fetchAsset)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchAsset)).toHaveBeenCalledWith(networkConfig, {
      code: "USDC",
      issuer: USDC_ISSUER,
    })
    expect(result.asset.value).toEqual(assetInfo)
    scope.stop()
  })

  it("reuses one cache entry for identical inputs", async () => {
    const scope = effectScope()
    const first = scope.run(() => useAsset({ ...validAsset }))!
    await settle()
    expect(vi.mocked(fetchAsset)).toHaveBeenCalledTimes(1)

    const second = scope.run(() => useAsset({ ...validAsset }))!
    await settle()
    expect(vi.mocked(fetchAsset)).toHaveBeenCalledTimes(1)
    expect(second.asset.value).toEqual(assetInfo)
    expect(first.asset.value).toEqual(assetInfo)
    scope.stop()
  })

  it("releases the store subscription on scope disposal", async () => {
    const scope = effectScope()
    scope.run(() => useAsset({ ...validAsset }))!
    await settle()
    expect(subscriptions.size).toBeGreaterThan(0)

    scope.stop()
    expect(subscriptions.size).toBe(0)
  })

  it("maps fetch failures to StellarError", async () => {
    const failure = Object.assign(new Error("Horizon unavailable"), { code: "NETWORK_ERROR" })
    vi.mocked(fetchAsset).mockRejectedValueOnce(failure)

    const scope = effectScope()
    const result = scope.run(() => useAsset({ ...validAsset }))!
    await settle()

    expect(result.error.value).toBe(failure)
    expect(toStellarError).toHaveBeenCalledWith(failure)
    expect(result.asset.value).toBeNull()
    scope.stop()
  })
})
