import { useEffect, useRef } from "react"
import { useStellarContext } from "../context/StellarProvider"
import { toStellarError } from "../errors"
import { useQuery } from "../cache"
import { fetchAsset, assetKey } from "../queries/asset"
import type { AssetInfo } from "../queries/asset"
import type { StellarError } from "../types"

export type { AssetInfo }

export interface UseAssetOptions {
  code: string
  issuer: string
  autoFetch?: boolean
  /** Override the provider-level staleTime for this hook instance (ms). */
  staleTime?: number
  /**
   * Maximum number of automatic retries on retriable failures (429, 5xx,
   * network errors). Default: 3. Set to 0 to disable.
   */
  maxRetries?: number
}

export interface UseAssetReturn {
  asset: AssetInfo | null
  loading: boolean
  error: StellarError | null
  refetch: () => void
}

/**
 * Fetches details about a specific asset on the Stellar network.
 *
 * Results are cached in the shared QueryStore and deduplicated.
 *
 * @param options - Configuration options
 * @param options.code - The asset code (e.g., "USDC")
 * @param options.issuer - The asset issuer's Stellar address
 * @param options.autoFetch - Whether to automatically fetch on mount (default: true)
 * @param options.staleTime - Override the provider-level staleTime for this hook.
 * @returns `{ asset, loading, error, refetch }`
 *
 * @example
 * const { asset, loading } = useAsset({ code: "USDC", issuer: "G..." })
 */
export function useAsset({
  code,
  issuer,
  autoFetch = true,
  staleTime,
  maxRetries,
}: UseAssetOptions): UseAssetReturn {
  const { network, networkConfig, queryStore } = useStellarContext()

  const queryKey = assetKey(networkConfig.horizonUrl, network, code, issuer)
  const queryIdentity = `${networkConfig.horizonUrl}|${network}|${code}|${issuer}`
  const previousQueryIdentity = useRef(queryIdentity)
  const queryChanged = previousQueryIdentity.current !== queryIdentity

  useEffect(() => {
    previousQueryIdentity.current = queryIdentity
  }, [queryIdentity])

  const {
    data: asset,
    loading,
    error: rawError,
    refetch,
  } = useQuery<AssetInfo>({
    queryKey,
    queryFn: async () => fetchAsset(networkConfig, { code, issuer }),
    store: queryStore,
    staleTime,
    enabled: autoFetch,
    maxRetries,
  })

  const error = rawError ? toStellarError(rawError) : null

  return { asset: queryChanged ? null : asset, loading, error, refetch }
}
