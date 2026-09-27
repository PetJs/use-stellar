import type { CacheEntry } from "./types"
import { DEFAULT_STALE_TIME } from "./types"
import type { QueryStore } from "./store"
import { serializeKey } from "./keys"
import { retryWithBackoff, getRetryAfterMs } from "../utils/retryWithBackoff"
import { onlineManager } from "../runtime/onlineManager"

/**
 * Options for {@link createQueryObserver}.
 *
 * This is a framework-neutral extraction of the orchestration `useQuery` used
 * to perform: in-flight dedup, staleTime freshness checks, forced refetch, and
 * writing results back to `QueryStore`. React (and any other framework
 * adapter) is responsible only for projecting `getSnapshot()` into its own
 * state/reactivity model.
 */
export interface QueryObserverOptions<T> {
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
   * Query). The observer reports the current store snapshot but never fetches
   * or subscribes.
   */
  enabled?: boolean
  /**
   * Maximum number of automatic retries after a retriable failure (429, 5xx,
   * network errors). Defaults to 3. Set to 0 to disable automatic retries.
   */
  maxRetries?: number
}

/** Mutable snapshot of the observer's current view of the query. */
export interface QueryObserverSnapshot<T> {
  data: T | null
  loading: boolean
  error: unknown
  updatedAt: number | null
}

/** The subset of {@link QueryObserverOptions} that `setOptions` may change. */
export type QueryObserverSettableOptions<T> = Pick<
  QueryObserverOptions<T>,
  "queryKey" | "queryFn" | "staleTime" | "enabled" | "maxRetries"
>

/** Listener signature for {@link QueryObserver.subscribe}. */
export type QueryObserverListener<T> = (snapshot: QueryObserverSnapshot<T>) => void

/**
 * Framework-neutral query orchestration extracted from `useQuery`.
 *
 * Owns: in-flight dedup (delegated to `QueryStore`, which already tracks it —
 * this does not introduce a second dedup mechanism), staleTime freshness
 * checks, forced refetch, and writing results back to the store. A framework
 * adapter (React's `useQuery`, or any other) subscribes for change
 * notifications and projects `getSnapshot()` into its own reactivity model.
 */
export interface QueryObserver<T> {
  /** Returns the observer's current snapshot without subscribing. */
  getSnapshot: () => QueryObserverSnapshot<T>
  /**
   * Registers a listener invoked synchronously whenever the snapshot changes.
   * Returns an unsubscribe function.
   */
  subscribe: (listener: QueryObserverListener<T>) => () => void
  /** Triggers a fetch. `force: true` bypasses dedup and freshness checks. */
  fetch: (options?: { force?: boolean }) => Promise<void>
  /**
   * Atomically switches the observer's configuration, including its query
   * key. Unsubscribes from the old store entry (if it was subscribed),
   * updates the active config, subscribes to the new entry when enabled, and
   * performs the required fetch exactly once.
   */
  setOptions: (next: QueryObserverSettableOptions<T>) => void
  /**
   * Epoch ms until which this query is rate-limited (from the last 429
   * `Retry-After` header), or null when not rate-limited. Exposed as a plain
   * getter so polling logic can read it without subscribing.
   */
  getRateLimitedUntil: () => number | null
  /** Unsubscribes from the store and releases all listeners. Idempotent. */
  destroy: () => void
}

/**
 * Creates a framework-neutral query observer.
 *
 * Behaviour (extracted verbatim from `useQuery`):
 * - On start (subscribe or an enabled construction): subscribes to the store
 *   and runs the query unless cached data is still within `staleTime`.
 * - While a fetch is in flight for the same key: awaits the store's existing
 *   promise (deduplication — no second network request).
 * - On success/error: writes the result to the store; every subscriber across
 *   every observer on that key is notified.
 * - `enabled: false` never fetches and never subscribes.
 * - On 429: honours `Retry-After`, retries up to `maxRetries` times with
 *   exponential back-off. `getRateLimitedUntil()` exposes the resulting
 *   rate-limit window without requiring a subscription.
 * - While offline (see `onlineManager`): no new request starts, forced or not,
 *   and cached data stays visible. A request that fails because the connection
 *   dropped does not overwrite the entry with an error. On reconnect, the query
 *   refetches once if its data is stale.
 */
export function createQueryObserver<T>(options: QueryObserverOptions<T>): QueryObserver<T> {
  const store = options.store
  let queryKey = options.queryKey
  let queryFn = options.queryFn
  let staleTime = options.staleTime
  let enabled = options.enabled ?? true
  let maxRetries = options.maxRetries ?? 3

  let keyStr = serializeKey(queryKey)
  let rateLimitedUntil: number | null = null

  const listeners = new Set<QueryObserverListener<T>>()
  let storeUnsubscribe: (() => void) | null = null
  let onlineUnsubscribe: (() => void) | null = null
  let destroyed = false

  function readSnapshot(): QueryObserverSnapshot<T> {
    const entry = store.getSnapshot<T>(queryKey)
    return {
      data: entry?.data ?? null,
      loading: enabled ? (entry?.loading ?? false) : false,
      error: entry?.error ?? null,
      updatedAt: entry?.updatedAt ?? null,
    }
  }

  let currentSnapshot: QueryObserverSnapshot<T> = readSnapshot()

  function emit(): void {
    for (const listener of listeners) {
      listener(currentSnapshot)
    }
  }

  function updateFromEntry(entry: CacheEntry<T>): void {
    currentSnapshot = {
      data: entry.data,
      loading: entry.loading,
      error: entry.error,
      updatedAt: entry.updatedAt,
    }
    emit()
  }

  function projectDisabledSnapshot(): void {
    // Disabled — project the current store snapshot so a previous query's
    // `loading` cannot stick: nothing will ever arrive to clear it, because no
    // subscription is set up while disabled.
    const current = store.getSnapshot<T>(queryKey)
    currentSnapshot = {
      data: current?.data ?? null,
      loading: false,
      error: current?.error ?? null,
      updatedAt: current?.updatedAt ?? null,
    }
    emit()
  }

  function unsubscribeFromStore(): void {
    if (storeUnsubscribe) {
      storeUnsubscribe()
      storeUnsubscribe = null
    }
    if (onlineUnsubscribe) {
      onlineUnsubscribe()
      onlineUnsubscribe = null
    }
  }

  function subscribeToStore(): void {
    if (storeUnsubscribe) return
    storeUnsubscribe = store.subscribe<T>(queryKey, entry => {
      updateFromEntry(entry)
    })
    // Coming back online refetches once, and only if the data is stale. Every
    // observer on a key hears the event, but the first one's request is
    // registered in the store synchronously, so the rest await it instead of
    // sending their own.
    onlineUnsubscribe = onlineManager.subscribe(online => {
      if (online) void fetch({ force: false })
    })
  }

  async function fetch(fetchOptions: { force?: boolean } = {}): Promise<void> {
    const forceRefetch = fetchOptions.force ?? false
    if (!enabled) return

    const currentKey = queryKey
    const currentFn = queryFn
    const currentStore = store
    const currentMaxRetries = maxRetries
    const currentStaleTime = staleTime ?? DEFAULT_STALE_TIME

    // Deduplication: if a fetch for this key is already running, await it and
    // use its result — no second network request.
    const inflight = currentStore.getInflightPromise<T>(currentKey)
    if (inflight && !forceRefetch) {
      try {
        await inflight
      } catch {
        // The error was already stored by whoever started the fetch.
      }
      return
    }

    // Freshness: skip the request if data is within staleTime.
    if (!forceRefetch && currentStore.isFresh(currentKey, currentStaleTime)) {
      return
    }

    // Offline: the request can only fail, and its error would replace data
    // that is still worth showing. Skip it; reconnecting refetches.
    if (!onlineManager.isOnline()) {
      return
    }

    // Kept so a request cut off by going offline can settle the entry back to
    // how it was, rather than to an error about the connection.
    const previousError = currentStore.getSnapshot<T>(currentKey)?.error ?? null

    const promise = retryWithBackoff(() => currentFn(), {
      maxRetries: currentMaxRetries,
    })

    // Register in store before awaiting so concurrent subscribers see the
    // promise immediately.
    currentStore.setLoading(currentKey, promise)

    try {
      const data = await promise
      rateLimitedUntil = null
      currentStore.setData(currentKey, data)
    } catch (err) {
      // The connection dropped mid-request. That says nothing about the query,
      // so settle the entry as it was: `data` and `updatedAt` are left alone,
      // the cached value stays visible, and the reconnect refetch sees it as
      // stale.
      if (!onlineManager.isOnline()) {
        currentStore.setError(currentKey, previousError)
        return
      }

      const retryMs = getRetryAfterMs(err)
      rateLimitedUntil = retryMs !== null ? Date.now() + retryMs : null
      currentStore.setError(currentKey, err)
    }
  }

  function start(): void {
    if (!enabled) {
      projectDisabledSnapshot()
      return
    }
    subscribeToStore()
    currentSnapshot = readSnapshot()
    void fetch({ force: false })
  }

  function subscribe(listener: QueryObserverListener<T>): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  function setOptions(next: QueryObserverSettableOptions<T>): void {
    if (destroyed) return

    const nextKeyStr = serializeKey(next.queryKey)
    const keyChanged = nextKeyStr !== keyStr
    const wasEnabled = enabled

    queryKey = next.queryKey
    queryFn = next.queryFn
    staleTime = next.staleTime
    enabled = next.enabled ?? true
    maxRetries = next.maxRetries ?? 3
    keyStr = nextKeyStr

    if (keyChanged) {
      // Switch atomically: unsubscribe from the old entry first so its
      // subscriber count is never left elevated, then subscribe to the new
      // one (if enabled) and perform the required fetch exactly once.
      unsubscribeFromStore()

      if (!enabled) {
        projectDisabledSnapshot()
        return
      }

      subscribeToStore()
      currentSnapshot = readSnapshot()
      void fetch({ force: false })
      return
    }

    // Same key: only enabled/disabled transitions (or fn/staleTime/maxRetries
    // changes) need handling.
    if (!enabled) {
      unsubscribeFromStore()
      projectDisabledSnapshot()
      return
    }

    if (!wasEnabled) {
      // Disabled -> enabled on the same key: subscribe and fetch.
      subscribeToStore()
      currentSnapshot = readSnapshot()
      void fetch({ force: false })
      return
    }

    // Still enabled, same key: nothing structural changed. The next explicit
    // fetch()/refetch will pick up the new queryFn/staleTime/maxRetries.
    currentSnapshot = readSnapshot()
  }

  function destroy(): void {
    if (destroyed) return
    destroyed = true
    unsubscribeFromStore()
    listeners.clear()
  }

  // Kick off the initial subscription/fetch synchronously at construction —
  // mirrors useQuery's mount-time effect.
  start()

  return {
    getSnapshot: () => currentSnapshot,
    subscribe,
    fetch,
    setOptions,
    getRateLimitedUntil: () => rateLimitedUntil,
    destroy,
  }
}
