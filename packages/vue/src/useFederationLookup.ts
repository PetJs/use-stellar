import { computed, toValue } from "vue"
import type { MaybeRefOrGetter } from "vue"
import { toStellarError, createStellarError } from "@use-stellar/core"
import type { StellarError, FederationRecord } from "@use-stellar/core"

// @ts-expect-error Types might not resolve
import { fetchFederationLookup, federationKey } from "@use-stellar/core"
// @ts-expect-error Internal file
import { useQuery } from "./useQuery"

export interface UseFederationLookupOptions {
  address?: MaybeRefOrGetter<string | null>
  staleTime?: MaybeRefOrGetter<number | undefined>
}

export interface UseFederationLookupReturn {
  record: import("vue").Ref<FederationRecord | null>
  loading: import("vue").Ref<boolean>
  error: import("vue").Ref<StellarError | null>
  refetch: () => void
}

const FEDERATION_ADDRESS_RE = /^[^*]+\*[^*]+$/

export function useFederationLookup(
  options: UseFederationLookupOptions = {}
): UseFederationLookupReturn {
  const resolvedAddress = computed(() => {
    const addr = toValue(options.address)
    return typeof addr === "string" ? addr.trim() : null
  })

  const formatValid = computed(() =>
    resolvedAddress.value ? FEDERATION_ADDRESS_RE.test(resolvedAddress.value) : false
  )

  const resolvedStaleTime = computed(() => toValue(options.staleTime))

  const queryKey = computed(() => {
    if (resolvedAddress.value && formatValid.value) {
      return federationKey(resolvedAddress.value)
    }
    return ["federation", "disabled"] as const
  })

  const {
    data: record,
    loading,
    error: rawError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!resolvedAddress.value) return null
      return fetchFederationLookup({ address: resolvedAddress.value })
    },
    enabled: computed(() => Boolean(resolvedAddress.value) && formatValid.value),
    staleTime: resolvedStaleTime,
  })

  const error = computed(() => {
    if (resolvedAddress.value && !formatValid.value) {
      return createStellarError(
        "VALIDATION_ERROR",
        "Federated address must be in the form name*domain."
      )
    }
    return rawError.value ? toStellarError(rawError.value) : null
  })

  const refetchAsync = async () => {
    refetch()
  }

  return {
    record,
    loading,
    error,
    refetch: refetchAsync,
  }
}
