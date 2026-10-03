import { ref, computed, watch, toValue } from "vue"
import type { MaybeRefOrGetter } from "vue"
import { toStellarError } from "@use-stellar/core"
import type { StellarError, NormalizedTransaction } from "@use-stellar/core"

// @ts-expect-error -- "@use-stellar/core" is not resolvable from this package yet (Vue WIP)
import { fetchTransactionHistoryPage, transactionHistoryKey } from "@use-stellar/core"
import { useQuery } from "./useQuery"
// @ts-expect-error -- "@use-stellar/core" is not resolvable from this package yet (Vue WIP)
import { getNextCursor, getPrevCursor } from "@use-stellar/core"
import { useWallet } from "./useWallet"

export interface UseTransactionHistoryOptions {
  address?: MaybeRefOrGetter<string | null>
  limit?: MaybeRefOrGetter<number>
  order?: MaybeRefOrGetter<"asc" | "desc">
  cursor?: MaybeRefOrGetter<string | undefined>
}

export interface UseTransactionHistoryReturn {
  transactions: import("vue").Ref<NormalizedTransaction[]>
  loading: import("vue").Ref<boolean>
  error: import("vue").Ref<StellarError | null>
  refetch: () => void
  fetchNext: () => Promise<void>
  fetchPrev: () => Promise<void>
  hasNext: import("vue").Ref<boolean>
  hasPrev: import("vue").Ref<boolean>
}

export function useTransactionHistory(
  options: UseTransactionHistoryOptions = {}
): UseTransactionHistoryReturn {
  const wallet = useWallet ? useWallet() : { address: ref(null) }

  const currentCursor = ref<string | undefined>(toValue(options.cursor))

  watch(
    [() => toValue(options.address), () => toValue(options.limit), () => toValue(options.order)],
    () => {
      currentCursor.value = toValue(options.cursor)
    }
  )

  const resolvedAddress = computed(() => toValue(options.address) ?? wallet.address?.value)
  const resolvedLimit = computed(() => toValue(options.limit) ?? 10)
  const resolvedOrder = computed(() => toValue(options.order) ?? "desc")

  const queryKey = computed(() => {
    if (!resolvedAddress.value) return ["transactionHistory", "disabled"] as const
    return transactionHistoryKey(
      "network",
      "public",
      resolvedAddress.value,
      resolvedLimit.value,
      resolvedOrder.value,
      currentCursor.value
    )
  })

  const {
    data,
    loading,
    error: rawError,
    refetch,
  } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!resolvedAddress.value) return { records: [], hasNext: false, hasPrev: false }
      return fetchTransactionHistoryPage({
        address: resolvedAddress.value,
        limit: resolvedLimit.value,
        order: resolvedOrder.value,
        cursor: currentCursor.value,
      })
    },
    enabled: computed(() => Boolean(resolvedAddress.value)),
  })

  const error = computed(() => (rawError.value ? toStellarError(rawError.value) : null))

  const transactions = computed(() => data.value?.records ?? [])
  const hasNext = computed(() => data.value?.hasNext ?? false)
  const hasPrev = computed(() => data.value?.hasPrev ?? false)

  const fetchNext = async () => {
    if (!hasNext.value || !data.value) return
    const nextCursor = getNextCursor(data.value.records, resolvedOrder.value)
    if (nextCursor) {
      currentCursor.value = nextCursor
    }
  }

  const fetchPrev = async () => {
    if (!hasPrev.value || !data.value) return
    const prevCursor = getPrevCursor(data.value.records, resolvedOrder.value)
    if (prevCursor) {
      currentCursor.value = prevCursor
    }
  }

  return {
    transactions,
    loading,
    error,
    refetch,
    fetchNext,
    fetchPrev,
    hasNext,
    hasPrev,
  }
}
