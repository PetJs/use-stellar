import { ref, computed, toValue } from "vue"
import type { MaybeRefOrGetter } from "vue"
import { toStellarError } from "@use-stellar/core"
import type { AccountInfo, StellarError } from "@use-stellar/core"

// @ts-expect-error -- "@use-stellar/core" is not resolvable from this package yet (Vue WIP)
import { fetchAccount, accountKey } from "@use-stellar/core"
import { useQuery } from "./useQuery"
import { useWallet } from "./useWallet"

export interface UseAccountOptions {
  address?: MaybeRefOrGetter<string | null>
  staleTime?: MaybeRefOrGetter<number | undefined>
}

export interface UseAccountReturn {
  account: import("vue").Ref<AccountInfo | null>
  loading: import("vue").Ref<boolean>
  error: import("vue").Ref<StellarError | null>
  refetch: () => void
}

export function useAccount(options: UseAccountOptions = {}): UseAccountReturn {
  const wallet = useWallet ? useWallet() : { address: ref(null) }

  const resolvedAddress = computed(() => toValue(options.address) ?? wallet.address?.value)
  const resolvedStaleTime = computed(() => toValue(options.staleTime))

  const queryKey = computed(() => {
    if (!resolvedAddress.value) return ["account", "disabled"] as const
    return accountKey("network", "public", resolvedAddress.value)
  })

  const {
    data: account,
    loading,
    error: rawError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!resolvedAddress.value) return null
      return fetchAccount(resolvedAddress.value)
    },
    enabled: computed(() => Boolean(resolvedAddress.value)),
    staleTime: resolvedStaleTime,
  })

  const error = computed(() => (rawError.value ? toStellarError(rawError.value) : null))

  return {
    account,
    loading,
    error,
    refetch,
  }
}
