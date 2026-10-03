import { computed, toValue, watch } from "vue"
import type { ComputedRef, MaybeRefOrGetter } from "vue"
import {
  assetKeyStr,
  fetchPaymentPaths,
  paymentPathsKey,
  toStellarError,
} from "@use-stellar/core"
import type {
  Asset,
  PaymentPath,
  StellarError,
  UsePaymentPathsOptions as CorePaymentPathsOptions,
} from "use-stellar"
import { useQuery } from "./useQuery"
import { useStellar } from "./useStellar"

const DEFAULT_WATCH_INTERVAL = 10_000

type Reactive<T> = MaybeRefOrGetter<T>
type PaymentPathsResult = Awaited<ReturnType<typeof fetchPaymentPaths>>

type CommonOptions = {
  sourceAsset: Reactive<Asset | "" | null | undefined>
  destinationAsset: Reactive<Asset | "" | null | undefined>
  enabled?: Reactive<boolean>
  watch?: Reactive<boolean>
  interval?: Reactive<number>
}

export type UsePaymentPathsOptions = CommonOptions &
  (
    | {
        mode: Reactive<"strictSend">
        sourceAmount: Reactive<string | null | undefined>
        destinationAddress?: Reactive<string | undefined>
        destinationAmount?: never
        sourceAddress?: never
      }
    | {
        mode: Reactive<"strictReceive">
        destinationAmount: Reactive<string | null | undefined>
        sourceAddress?: Reactive<string | undefined>
        sourceAmount?: never
        destinationAddress?: never
      }
  )

export interface UsePaymentPathsReturn {
  paths: ComputedRef<PaymentPath[]>
  loading: ComputedRef<boolean>
  error: ComputedRef<StellarError | null>
  lastUpdated: ComputedRef<Date | null>
  refetch: () => void
}

function hasAsset(asset: Asset | "" | null | undefined): asset is Asset {
  return asset != null && asset !== ""
}

export function usePaymentPaths(options: UsePaymentPathsOptions): UsePaymentPathsReturn {
  const { runtime, snapshot } = useStellar()
  const store = runtime.getQueryStore()

  const resolved = computed<CorePaymentPathsOptions | null>(() => {
    const mode = toValue(options.mode)
    const sourceAsset = toValue(options.sourceAsset)
    const destinationAsset = toValue(options.destinationAsset)
    if (!hasAsset(sourceAsset) || !hasAsset(destinationAsset)) return null

    if (mode === "strictSend") {
      const sourceAmount = toValue(options.sourceAmount)
      if (!sourceAmount?.trim()) return null
      return {
        mode,
        sourceAsset,
        destinationAsset,
        sourceAmount,
        destinationAddress: toValue(options.destinationAddress),
      }
    }

    const destinationAmount = toValue(options.destinationAmount)
    if (!destinationAmount?.trim()) return null
    return {
      mode,
      sourceAsset,
      destinationAsset,
      destinationAmount,
      sourceAddress: toValue(options.sourceAddress),
    }
  })

  const enabled = computed(() => resolved.value !== null && toValue(options.enabled) !== false)
  const queryKey = computed(() => {
    const input = resolved.value
    if (!input) return ["paymentPaths", "disabled"] as const
    const amount = input.mode === "strictSend" ? input.sourceAmount : input.destinationAmount
    const address =
      input.mode === "strictSend" ? input.destinationAddress : input.sourceAddress
    return paymentPathsKey(
      snapshot.networkConfig.horizonUrl,
      snapshot.network,
      input.mode,
      assetKeyStr(input.sourceAsset),
      assetKeyStr(input.destinationAsset),
      amount,
      address
    )
  })

  const query = useQuery<PaymentPathsResult>({
    queryKey,
    queryFn: () => fetchPaymentPaths(snapshot.networkConfig, resolved.value!),
    store,
    enabled,
  })

  const currentData = computed(() => {
    if (!enabled.value) return null
    // Reading query.data tracks store notifications while the key selects the
    // active entry, so a previous route never appears under new inputs.
    void query.data.value
    return store.getSnapshot<PaymentPathsResult>(queryKey.value)?.data ?? null
  })
  const paths = computed(() => currentData.value?.paths ?? [])
  const loading = computed(() => enabled.value && query.loading.value)
  const error = computed(() =>
    enabled.value && query.error.value ? toStellarError(query.error.value) : null
  )
  const lastUpdated = computed(() => {
    if (!enabled.value) return null
    void query.updatedAt.value
    const entry = store.getSnapshot<PaymentPathsResult>(queryKey.value)
    return entry?.data?.lastUpdated ?? (entry?.updatedAt ? new Date(entry.updatedAt) : null)
  })

  const refetch = () => {
    if (enabled.value) query.refetch()
  }

  watch(
    () => [enabled.value, toValue(options.watch) === true, toValue(options.interval), queryKey.value],
    (_, __, onCleanup) => {
      if (!enabled.value || toValue(options.watch) !== true) return
      const interval = toValue(options.interval) ?? DEFAULT_WATCH_INTERVAL
      const timer = setInterval(refetch, interval > 0 ? interval : DEFAULT_WATCH_INTERVAL)
      onCleanup(() => clearInterval(timer))
    },
    { immediate: true }
  )

  return { paths, loading, error, lastUpdated, refetch }
}
