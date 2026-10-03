import { computed, toValue } from "vue"
import type { MaybeRefOrGetter } from "vue"
import {
  createStellarError,
  isValidAssetCode,
  isValidStellarAddress,
  toStellarError,
} from "@use-stellar/core"
import type { AssetInfo, StellarError } from "@use-stellar/core"

// @ts-expect-error Types might not resolve
import { fetchAsset, assetKey } from "@use-stellar/core"
// @ts-expect-error Internal file
import { useQuery } from "./useQuery"
import { useStellar } from "./useStellar"

export interface UseAssetOptions {
  code?: MaybeRefOrGetter<string | null | undefined>
  issuer?: MaybeRefOrGetter<string | null | undefined>
  autoFetch?: MaybeRefOrGetter<boolean>
  staleTime?: MaybeRefOrGetter<number | undefined>
}

export interface UseAssetReturn {
  asset: import("vue").Ref<AssetInfo | null>
  loading: import("vue").Ref<boolean>
  error: import("vue").Ref<StellarError | null>
  refetch: () => void
}

function normalizeInput(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Looks up an issued asset on Horizon and returns its {@link AssetInfo}.
 *
 * `code`, `issuer`, `autoFetch` and `staleTime` may each be a static value, a
 * Vue `ref`, or a getter. The request is delegated to the React-free core
 * `fetchAsset` through the internal Vue `useQuery` adapter, so the cache entry
 * is keyed by `assetKey` — the same key the React `useAsset` hook uses, which
 * lets mixed React/Vue apps share one cache entry.
 *
 * A `null`/empty code or issuer is treated as idle: no request is made, no
 * error is reported and `loading` stays `false`. The asset code and issuer are
 * validated with the shared core utilities before any request is issued.
 *
 * @example
 * const { asset, loading, error, refetch } = useAsset({ code: "USDC", issuer: "G..." })
 */
export function useAsset(options: UseAssetOptions): UseAssetReturn {
  const { snapshot, runtime } = useStellar()
  const store = runtime.getQueryStore()

  const resolvedCode = computed(() => normalizeInput(toValue(options.code)))
  const resolvedIssuer = computed(() => normalizeInput(toValue(options.issuer)))
  const resolvedStaleTime = computed(() => toValue(options.staleTime))

  const codeValid = computed(
    () => resolvedCode.value !== null && isValidAssetCode(resolvedCode.value)
  )
  const issuerValid = computed(
    () => resolvedIssuer.value !== null && isValidStellarAddress(resolvedIssuer.value)
  )
  const inputValid = computed(() => codeValid.value && issuerValid.value)

  const enabled = computed(() => inputValid.value && toValue(options.autoFetch) !== false)

  const queryKey = computed(() => {
    if (!inputValid.value) return ["asset", "disabled"] as const
    return assetKey(
      snapshot.networkConfig.horizonUrl,
      snapshot.network,
      resolvedCode.value as string,
      resolvedIssuer.value as string
    )
  })

  const {
    data: asset,
    loading,
    error: rawError,
    refetch,
  } = useQuery<AssetInfo>({
    queryKey,
    queryFn: () =>
      fetchAsset(snapshot.networkConfig, {
        code: resolvedCode.value as string,
        issuer: resolvedIssuer.value as string,
      }),
    store,
    enabled,
    staleTime: resolvedStaleTime,
  })

  const error = computed<StellarError | null>(() => {
    if (resolvedCode.value !== null && !codeValid.value) {
      return createStellarError("VALIDATION_ERROR", `Invalid asset code: ${resolvedCode.value}`)
    }
    if (resolvedIssuer.value !== null && !issuerValid.value) {
      return createStellarError("VALIDATION_ERROR", `Invalid asset issuer: ${resolvedIssuer.value}`)
    }
    return rawError.value ? toStellarError(rawError.value) : null
  })

  return { asset, loading, error, refetch }
}
