/**
 * #360 — Vue internal `useQuery` adapter over the shared QueryStore.
 *
 * Every Vue read composable needs the same plumbing:
 *  - Resolve a reactive query key
 *  - Subscribe to the store on scope mount, unsubscribe on disposal
 *  - Fetch on mount if data is stale (or `enabled` flips to true)
 *  - Re-fetch reactively when `queryKey` or `enabled` changes
 *  - Expose `data`, `loading`, `error`, `updatedAt`, `refetch`
 *
 * All orchestration — in-flight dedup, staleTime freshness, retries, and store
 * writes — lives in core's framework-neutral `createQueryObserver`, the same
 * observer React's `useQuery` wraps. This composable only projects the
 * observer's snapshot into Vue refs.
 *
 * This composable is an internal implementation detail; consumers use
 * the higher-level composables (e.g. `useBalance`) which call this.
 */
import { readonly, ref, watch, onScopeDispose, unref, type Ref } from "vue"
import { createQueryObserver, serializeKey } from "use-stellar/core"
import type { QueryObserverSnapshot, QueryStore } from "use-stellar/core"

export interface UseQueryOptions<T> {
  /** Reactive (or plain) query key that identifies this request in the store. */
  queryKey: Ref<readonly unknown[]> | readonly unknown[]
  /** The async function that performs the actual network request. */
  queryFn: () => Promise<T>
  /** The store instance from the StellarProvider context. */
  store: QueryStore
  /**
   * How long (ms) data is considered fresh. Overrides the provider default.
   * Set to 0 to always re-fetch on mount.
   */
  staleTime?: number
  /**
   * Reactive flag — set to a `Ref<boolean>` or a plain boolean.
   * When `false` the query never fetches. Defaults to `true`.
   */
  enabled?: Ref<boolean> | boolean
  /**
   * Maximum number of automatic retries on retriable failures (429, 5xx,
   * network errors). Default 3. Set to 0 to disable.
   */
  maxRetries?: number
}

export interface UseQueryReturn<T> {
  /** Current data from the last successful fetch, or `null`. */
  data: Readonly<Ref<T | null>>
  /** `true` while a fetch is in progress. */
  loading: Readonly<Ref<boolean>>
  /** Last error, or `null`. */
  error: Readonly<Ref<unknown>>
  /** Epoch ms of the most recent successful fetch, or `null`. */
  updatedAt: Readonly<Ref<number | null>>
  /** Trigger a fresh fetch, bypassing staleTime. */
  refetch: () => void
}

export function useQuery<T>({
  queryKey,
  queryFn,
  store,
  staleTime,
  enabled = true,
  maxRetries = 3,
}: UseQueryOptions<T>): UseQueryReturn<T> {
  const data = ref<T | null>(null) as Ref<T | null>
  const loading = ref(false)
  const error = ref<unknown>(null)
  const updatedAt = ref<number | null>(null)

  function project(snapshot: QueryObserverSnapshot<T>): void {
    data.value = snapshot.data
    loading.value = snapshot.loading
    error.value = snapshot.error
    updatedAt.value = snapshot.updatedAt
  }

  const observer = createQueryObserver<T>({
    queryKey: unref(queryKey),
    queryFn,
    store,
    staleTime,
    enabled: unref(enabled),
    maxRetries,
  })
  const unsubscribe = observer.subscribe(project)
  project(observer.getSnapshot())

  // Key or enabled changes are applied atomically by the observer, which
  // unsubscribes from the old entry and fetches the new one exactly once.
  watch(
    () => ({ key: serializeKey(unref(queryKey)), on: unref(enabled) }),
    ({ on }) => {
      observer.setOptions({
        queryKey: unref(queryKey),
        queryFn,
        staleTime,
        enabled: on,
        maxRetries,
      })
      project(observer.getSnapshot())
    }
  )

  onScopeDispose(() => {
    unsubscribe()
    observer.destroy()
  })

  return {
    data: readonly(data) as Readonly<Ref<T | null>>,
    loading: readonly(loading),
    error: readonly(error),
    updatedAt: readonly(updatedAt),
    refetch: () => void observer.fetch({ force: true }),
  }
}
