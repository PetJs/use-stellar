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
 * This composable is an internal implementation detail; consumers use
 * the higher-level composables (e.g. `useBalance`) which call this.
 */
import { readonly, ref, watch, onScopeDispose, type Ref } from "vue"
import { serializeKey } from "../cache/keys"
import { retryWithBackoff, getRetryAfterMs } from "../utils/retryWithBackoff"
import type { QueryStore } from "../cache/store"

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

  // Resolve the key whether it is a Ref or a plain array.
  const resolveKey = (): readonly unknown[] =>
    "value" in (queryKey as object)
      ? (queryKey as Ref<readonly unknown[]>).value
      : (queryKey as readonly unknown[])

  const resolveEnabled = (): boolean =>
    typeof enabled === "object" && "value" in enabled ? enabled.value : (enabled as boolean)

  let currentKey: string | null = null
  let unsub: (() => void) | null = null

  function syncFromStore(key: string): void {
    const snap = store.snapshot<T>(key)
    if (snap) {
      if (snap.data !== null) data.value = snap.data
      loading.value = snap.loading
      error.value = snap.error
      updatedAt.value = snap.updatedAt
    }
  }

  function subscribe(key: string): void {
    if (unsub) {
      unsub()
      unsub = null
    }
    currentKey = key
    // Register store listener so reactive refs update on any cache change.
    unsub = store.subscribe<T>(key, entry => {
      if (entry.data !== null) data.value = entry.data
      loading.value = entry.loading
      error.value = entry.error
      updatedAt.value = entry.updatedAt
    })
    syncFromStore(key)
  }

  const rateLimitedUntil = ref<number | null>(null)

  async function fetchData(): Promise<void> {
    if (!resolveEnabled()) return
    const key = serializeKey(resolveKey())

    // Serve stale data immediately from store if fresh enough.
    const snap = store.snapshot<T>(key)
    if (snap?.updatedAt !== null && staleTime !== 0) {
      const age = Date.now() - (snap?.updatedAt ?? 0)
      const effective = staleTime ?? store.defaultStaleTime
      if (age < effective && snap?.data !== null) return
    }

    loading.value = true
    error.value = null

    try {
      const result = await retryWithBackoff(queryFn, {
        maxRetries,
        onRateLimit: retryAfterMs => {
          rateLimitedUntil.value = Date.now() + retryAfterMs
        },
      })
      store.setSuccess(key, result)
    } catch (err) {
      store.setError(key, err)
      error.value = err
    } finally {
      loading.value = false
    }
  }

  // Watch the key and enabled flag reactively.
  watch(
    () => ({
      k: serializeKey(resolveKey()),
      e: resolveEnabled(),
    }),
    ({ k, e }) => {
      subscribe(k)
      if (e) void fetchData()
    },
    { immediate: true }
  )

  onScopeDispose(() => {
    if (unsub) {
      unsub()
      unsub = null
    }
  })

  function refetch(): void {
    void fetchData()
  }

  return {
    data: readonly(data),
    loading: readonly(loading),
    error: readonly(error),
    updatedAt: readonly(updatedAt),
    refetch,
  }
}
