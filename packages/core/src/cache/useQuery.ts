import { useCallback, useEffect, useRef, useState } from "react"
import type { QueryStore } from "./store"
import { serializeKey } from "./keys"
import { createQueryObserver, type QueryObserver, type QueryObserverSnapshot } from "./observer"

/**
 * Options for `useQuery`.
 */
export interface UseQueryOptions<T> {
  /** The query key that identifies this request in the store. */
  queryKey: readonly unknown[]
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
   * Set to false to skip the fetch entirely (like `enabled: false` in TanStack
   * Query). The hook returns the current store snapshot but never fetches.
   */
  enabled?: boolean
  /**
   * Maximum number of automatic retries after a retriable failure (429, 5xx,
   * network errors). Defaults to 3. Set to 0 to disable automatic retries.
   *
   * When a 429 is received, the `Retry-After` response header is honoured
   * exactly. Other retriable errors use exponential back-off with full jitter.
   */
  maxRetries?: number
}

/**
 * Return shape mirroring what every existing hook already exposes, so the
 * cache is truly an implementation detail.
 */
export interface UseQueryResult<T> {
  data: T | null
  loading: boolean
  error: unknown
  /** Imperatively trigger a fresh fetch, bypassing staleTime. */
  refetch: () => void
  /** Epoch ms of the most recent successful fetch, or null. */
  updatedAt: number | null
  /**
   * A ref whose `.current` value is the epoch ms until which this query is
   * rate-limited (from the last 429 `Retry-After` header), or null when not
   * rate-limited. Exposed as a ref so polling hooks can read it without
   * causing re-renders.
   */
  rateLimitedUntilRef: React.MutableRefObject<number | null>
}

/**
 * The core caching primitive consumed by every read hook.
 *
 * A thin React adapter over the framework-neutral {@link createQueryObserver}:
 * React's only responsibility here is projecting the observer's snapshot into
 * component state so the reconciler knows when to re-render. All
 * orchestration — in-flight dedup, staleTime freshness, forced refetch, and
 * store writes — lives in the observer.
 */
export function useQuery<T>({
  queryKey,
  queryFn,
  store,
  staleTime,
  enabled = true,
  maxRetries = 3,
}: UseQueryOptions<T>): UseQueryResult<T> {
  const keyStr = serializeKey(queryKey)

  // The observer is created lazily on first render and swapped only when the
  // store changes (which never happens across the observer's lifetime in
  // practice, but is handled for completeness). Key/fn/staleTime/enabled
  // changes are routed through setOptions rather than recreating the
  // observer, so subscriptions never leak across a key switch.
  const observerRef = useRef<QueryObserver<T> | null>(null)
  if (observerRef.current === null) {
    observerRef.current = createQueryObserver<T>({
      queryKey,
      queryFn,
      store,
      staleTime,
      enabled,
      maxRetries,
    })
  }

  const [snapshot, setSnapshot] = useState<QueryObserverSnapshot<T>>(() =>
    observerRef.current!.getSnapshot()
  )

  // rateLimitedUntilRef mirrors the observer's rate-limit window. Stored as a
  // ref (not state) so polling hooks can read it imperatively without
  // triggering re-renders and without act() issues in tests.
  const rateLimitedUntilRef = useRef<number | null>(null)

  // Keep the observer's configuration in sync with the latest render's
  // options. This is where key switching, enabling/disabling, and store
  // changes are applied — atomically, via the observer's own setOptions.
  useEffect(() => {
    observerRef.current!.setOptions({ queryKey, queryFn, staleTime, enabled, maxRetries })
    setSnapshot(observerRef.current!.getSnapshot())
    rateLimitedUntilRef.current = observerRef.current!.getRateLimitedUntil()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr, store, enabled])

  // Subscribe once (per observer instance) for change notifications.
  useEffect(() => {
    const observer = observerRef.current!
    const unsubscribe = observer.subscribe(next => {
      setSnapshot(next)
      rateLimitedUntilRef.current = observer.getRateLimitedUntil()
    })
    // Sync in case setOptions above ran before this subscription existed.
    setSnapshot(observer.getSnapshot())
    rateLimitedUntilRef.current = observer.getRateLimitedUntil()

    return () => {
      unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyStr, store, enabled])

  // Destroy the observer only when the hook instance unmounts for good.
  useEffect(() => {
    return () => {
      observerRef.current?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refetch = useCallback(() => {
    void observerRef.current!.fetch({ force: true })
  }, [])

  return {
    data: snapshot.data,
    loading: snapshot.loading,
    error: snapshot.error,
    updatedAt: snapshot.updatedAt,
    rateLimitedUntilRef,
    refetch,
  }
}
