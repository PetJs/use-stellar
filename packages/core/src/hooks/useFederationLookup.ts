import { createStellarError, toStellarError } from "../errors"
import { useStellarContext } from "../context/StellarProvider"
import { useQuery } from "../cache"
import { fetchFederationLookup, federationKey } from "../queries/federation"
import type {
  FederationRecord,
  UseFederationLookupOptions,
  UseFederationLookupReturn,
  StellarError,
} from "../types"

const FEDERATION_ADDRESS_RE = /^[^*]+\*[^*]+$/

/**
 * Resolves a federation address (e.g., "alice*stellar.org") to an account ID.
 *
 * Results are cached in the shared QueryStore and deduplicated.
 *
 * @example
 * const { record } = useFederationLookup({ address: "alice*stellar.org" })
 */
export function useFederationLookup({
  address,
  staleTime,
}: UseFederationLookupOptions & { staleTime?: number } = {}): UseFederationLookupReturn {
  const { queryStore } = useStellarContext()

  const normalizedAddress = typeof address === "string" ? address.trim() : null
  const formatValid = normalizedAddress ? FEDERATION_ADDRESS_RE.test(normalizedAddress) : false

  const queryKey =
    normalizedAddress && formatValid
      ? federationKey(normalizedAddress)
      : (["federation", "disabled"] as const)

  const {
    data: record,
    loading,
    error: rawError,
    refetch,
  } = useQuery<FederationRecord>({
    queryKey,
    queryFn: async () => fetchFederationLookup({ address: normalizedAddress! }),
    store: queryStore,
    staleTime,
    enabled: Boolean(normalizedAddress) && formatValid,
  })

  // The declared contract is `() => Promise<void>`; useQuery's refetch is
  // synchronous, so awaiting callers still get a settled promise.
  const refetchAsync = async () => {
    refetch()
  }

  // Invalid format → immediate validation error, no network request.
  if (normalizedAddress && !formatValid) {
    const validationError: StellarError = createStellarError(
      "VALIDATION_ERROR",
      "Federated address must be in the form name*domain."
    )
    return {
      record: null,
      loading: false,
      error: validationError,
      refetch: refetchAsync,
    }
  }

  const error = rawError ? toStellarError(rawError) : null

  return { record, loading, error, refetch: refetchAsync }
}
