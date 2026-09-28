/**
 * Tests for the framework-neutral QueryObserver extracted from useQuery.
 *
 * Plain TypeScript, fake timers, no DOM, no React. These prove the
 * orchestration semantics that useQuery.test.ts / integration.test.tsx assert
 * indirectly through React: dedup, freshness, forced refetch, key switching,
 * subscription lifecycle, and disabled/enabled transitions.
 */
import { QueryStore } from "./store"
import { createQueryObserver } from "./observer"

describe("createQueryObserver — initial fetch", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it("fetches once on construction and writes data to the store", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("value-1")

    const observer = createQueryObserver({
      store,
      queryKey: ["k1"],
      queryFn,
    })

    await jest.runAllTimersAsync()

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(observer.getSnapshot().data).toBe("value-1")
    expect(observer.getSnapshot().loading).toBe(false)
    expect(observer.getSnapshot().error).toBeNull()

    observer.destroy()
  })

  it("surfaces loading:true while the fetch is in flight", async () => {
    const store = new QueryStore()
    let resolveFn: (v: string) => void = () => {}
    const queryFn = jest.fn(
      () =>
        new Promise<string>(resolve => {
          resolveFn = resolve
        })
    )

    const observer = createQueryObserver({ store, queryKey: ["k1"], queryFn })

    // Let the microtask queue turn so setLoading has run.
    await Promise.resolve()
    await Promise.resolve()

    expect(observer.getSnapshot().loading).toBe(true)

    resolveFn("done")
    await jest.runAllTimersAsync()

    expect(observer.getSnapshot().loading).toBe(false)
    expect(observer.getSnapshot().data).toBe("done")

    observer.destroy()
  })
})

describe("createQueryObserver — shared in-flight promise", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("two observers on the same key share one in-flight request", async () => {
    const store = new QueryStore()
    let callCount = 0
    const queryFn = jest.fn(() => {
      callCount += 1
      return new Promise<string>(resolve => setTimeout(() => resolve("shared"), 100))
    })

    const observer1 = createQueryObserver({ store, queryKey: ["shared-key"], queryFn })
    const observer2 = createQueryObserver({ store, queryKey: ["shared-key"], queryFn })

    await jest.runAllTimersAsync()

    expect(callCount).toBe(1)
    expect(observer1.getSnapshot().data).toBe("shared")
    expect(observer2.getSnapshot().data).toBe("shared")

    observer1.destroy()
    observer2.destroy()
  })
})

describe("createQueryObserver — stale/fresh behaviour", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("does not refetch fresh data within staleTime", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("v1")

    const observer1 = createQueryObserver({
      store,
      queryKey: ["fresh"],
      queryFn,
      staleTime: 10_000,
    })
    await jest.runAllTimersAsync()
    expect(queryFn).toHaveBeenCalledTimes(1)
    observer1.destroy()

    const observer2 = createQueryObserver({
      store,
      queryKey: ["fresh"],
      queryFn,
      staleTime: 10_000,
    })
    await jest.runAllTimersAsync()

    // Still fresh — no second network call, and the cached value is served.
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(observer2.getSnapshot().data).toBe("v1")

    observer2.destroy()
  })

  it("refetches once staleTime has elapsed", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("v1")

    const observer1 = createQueryObserver({
      store,
      queryKey: ["stale"],
      queryFn,
      staleTime: 100,
    })
    await jest.runAllTimersAsync()
    observer1.destroy()

    jest.advanceTimersByTime(200)

    const observer2 = createQueryObserver({
      store,
      queryKey: ["stale"],
      queryFn,
      staleTime: 100,
    })
    await jest.runAllTimersAsync()

    expect(queryFn).toHaveBeenCalledTimes(2)
    observer2.destroy()
  })

  it("fetch({ force: true }) always performs the fetch even when fresh", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("v1")

    const observer = createQueryObserver({
      store,
      queryKey: ["force"],
      queryFn,
      staleTime: 100_000,
    })
    await jest.runAllTimersAsync()
    expect(queryFn).toHaveBeenCalledTimes(1)

    await observer.fetch({ force: true })
    await jest.runAllTimersAsync()

    expect(queryFn).toHaveBeenCalledTimes(2)
    observer.destroy()
  })
})

describe("createQueryObserver — loading/data/error transitions", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("transitions to error state on rejection, non-retriable", async () => {
    const store = new QueryStore()
    const err = new Error("boom")
    const queryFn = jest.fn().mockRejectedValue(err)

    const observer = createQueryObserver({ store, queryKey: ["err"], queryFn, maxRetries: 0 })
    await jest.runAllTimersAsync()

    expect(observer.getSnapshot().loading).toBe(false)
    expect(observer.getSnapshot().error).toBe(err)
    expect(observer.getSnapshot().data).toBeNull()

    observer.destroy()
  })

  it("clears a previous error on a subsequent successful forced fetch", async () => {
    const store = new QueryStore()
    const queryFn = jest
      .fn()
      .mockRejectedValueOnce(new Error("first fails"))
      .mockResolvedValue("ok")

    const observer = createQueryObserver({ store, queryKey: ["recover"], queryFn, maxRetries: 0 })
    await jest.runAllTimersAsync()
    expect(observer.getSnapshot().error).not.toBeNull()

    await observer.fetch({ force: true })
    await jest.runAllTimersAsync()

    expect(observer.getSnapshot().error).toBeNull()
    expect(observer.getSnapshot().data).toBe("ok")

    observer.destroy()
  })
})

describe("createQueryObserver — subscribe/unsubscribe lifecycle", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("notifies subscribers synchronously on store writes", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("notified")
    const observer = createQueryObserver({ store, queryKey: ["notify"], queryFn })

    const listener = jest.fn()
    observer.subscribe(listener)

    await jest.runAllTimersAsync()

    expect(listener).toHaveBeenCalled()
    const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0]
    expect(lastCall.data).toBe("notified")

    observer.destroy()
  })

  it("stops notifying after unsubscribe", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("v1")
    const observer = createQueryObserver({ store, queryKey: ["unsub"], queryFn })

    const listener = jest.fn()
    const unsubscribe = observer.subscribe(listener)
    await jest.runAllTimersAsync()

    const callsBefore = listener.mock.calls.length
    unsubscribe()

    await observer.fetch({ force: true })
    await jest.runAllTimersAsync()

    expect(listener.mock.calls.length).toBe(callsBefore)

    observer.destroy()
  })
})

describe("createQueryObserver — key switching", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("setOptions switches keys atomically: unsubscribes old, subscribes new, fetches once", async () => {
    const store = new QueryStore()
    const queryFnA = jest.fn().mockResolvedValue("a-data")
    const queryFnB = jest.fn().mockResolvedValue("b-data")

    const observer = createQueryObserver({ store, queryKey: ["key-a"], queryFn: queryFnA })
    await jest.runAllTimersAsync()
    expect(queryFnA).toHaveBeenCalledTimes(1)

    // Confirm the old entry has a subscriber before switching.
    expect(store.getSnapshot(["key-a"])?.subscribers).toBe(1)

    observer.setOptions({ queryKey: ["key-b"], queryFn: queryFnB })
    await jest.runAllTimersAsync()

    expect(queryFnB).toHaveBeenCalledTimes(1)
    expect(observer.getSnapshot().data).toBe("b-data")

    // Old entry's subscriber count must never leak or stay elevated.
    expect(store.getSnapshot(["key-a"])?.subscribers ?? 0).toBe(0)
    expect(store.getSnapshot(["key-b"])?.subscribers).toBe(1)

    observer.destroy()
  })

  it("does not leave a stale subscription after several key switches", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("x")

    const observer = createQueryObserver({ store, queryKey: ["k0"], queryFn })
    await jest.runAllTimersAsync()

    for (let i = 1; i <= 5; i++) {
      observer.setOptions({ queryKey: [`k${i}`], queryFn })
      await jest.runAllTimersAsync()
    }

    for (let i = 0; i < 5; i++) {
      expect(store.getSnapshot([`k${i}`])?.subscribers ?? 0).toBe(0)
    }
    expect(store.getSnapshot(["k5"])?.subscribers).toBe(1)

    observer.destroy()
  })
})

describe("createQueryObserver — disabled queries", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("enabled:false never fetches and never subscribes", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("never")

    const observer = createQueryObserver({
      store,
      queryKey: ["disabled"],
      queryFn,
      enabled: false,
    })
    await jest.runAllTimersAsync()

    expect(queryFn).not.toHaveBeenCalled()
    expect(observer.getSnapshot().loading).toBe(false)
    expect(store.getSnapshot(["disabled"])?.subscribers ?? 0).toBe(0)

    observer.destroy()
  })

  it("enabling after disabled triggers exactly one fetch and subscribes", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("now-enabled")

    const observer = createQueryObserver({
      store,
      queryKey: ["toggle"],
      queryFn,
      enabled: false,
    })
    await jest.runAllTimersAsync()
    expect(queryFn).not.toHaveBeenCalled()

    observer.setOptions({ queryKey: ["toggle"], queryFn, enabled: true })
    await jest.runAllTimersAsync()

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(observer.getSnapshot().data).toBe("now-enabled")
    expect(store.getSnapshot(["toggle"])?.subscribers).toBe(1)

    observer.destroy()
  })

  it("disabling an enabled observer unsubscribes and stops loading from sticking", async () => {
    const store = new QueryStore()
    let resolveFn: (v: string) => void = () => {}
    const queryFn = jest.fn(
      () =>
        new Promise<string>(resolve => {
          resolveFn = resolve
        })
    )

    const observer = createQueryObserver({ store, queryKey: ["disable-mid-flight"], queryFn })
    await Promise.resolve()
    await Promise.resolve()
    expect(observer.getSnapshot().loading).toBe(true)

    observer.setOptions({ queryKey: ["disable-mid-flight"], queryFn, enabled: false })

    // The previous fetch resolves after being disabled — must not leave the
    // disabled observer's projected loading stuck at true.
    resolveFn("late")
    await jest.runAllTimersAsync()

    expect(observer.getSnapshot().loading).toBe(false)
    expect(store.getSnapshot(["disable-mid-flight"])?.subscribers ?? 0).toBe(0)

    observer.destroy()
  })
})

describe("createQueryObserver — destroy", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("unsubscribes from the store and clears listeners", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("v")
    const observer = createQueryObserver({ store, queryKey: ["destroy-me"], queryFn })
    await jest.runAllTimersAsync()

    expect(store.getSnapshot(["destroy-me"])?.subscribers).toBe(1)

    const listener = jest.fn()
    observer.subscribe(listener)

    observer.destroy()

    expect(store.getSnapshot(["destroy-me"])?.subscribers).toBe(0)

    // Further store writes on that key must not reach the destroyed observer.
    store.setData(["destroy-me"], "ignored")
    expect(listener).not.toHaveBeenCalled()
  })

  it("is idempotent — calling destroy twice does not throw", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("v")
    const observer = createQueryObserver({ store, queryKey: ["idempotent"], queryFn })
    await jest.runAllTimersAsync()

    expect(() => {
      observer.destroy()
      observer.destroy()
    }).not.toThrow()
  })
})

describe("createQueryObserver — concurrent / key-change edge cases", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("a late result for the old key does not corrupt the new key's snapshot", async () => {
    const store = new QueryStore()
    let resolveOld: (v: string) => void = () => {}
    const queryFnOld = jest.fn(
      () =>
        new Promise<string>(resolve => {
          resolveOld = resolve
        })
    )
    const queryFnNew = jest.fn().mockResolvedValue("new-data")

    const observer = createQueryObserver({ store, queryKey: ["old-key"], queryFn: queryFnOld })
    await Promise.resolve()
    await Promise.resolve()

    observer.setOptions({ queryKey: ["new-key"], queryFn: queryFnNew })
    await jest.runAllTimersAsync()

    expect(observer.getSnapshot().data).toBe("new-data")

    // The old fetch finally resolves — it writes into the OLD store entry,
    // not into the observer's current (new-key) snapshot.
    resolveOld("stale-old-data")
    await jest.runAllTimersAsync()

    expect(observer.getSnapshot().data).toBe("new-data")
    expect(store.getSnapshot(["old-key"])?.data).toBe("stale-old-data")

    observer.destroy()
  })

  it("rate-limit window is exposed via getRateLimitedUntil after a 429", async () => {
    const store = new QueryStore()
    const rateLimitError = {
      response: {
        status: 429,
        headers: { "retry-after": "5" },
      },
    }
    const queryFn = jest.fn().mockRejectedValue(rateLimitError)

    const observer = createQueryObserver({
      store,
      queryKey: ["rate-limited"],
      queryFn,
      maxRetries: 0,
    })
    await jest.runAllTimersAsync()

    expect(observer.getRateLimitedUntil()).not.toBeNull()

    observer.destroy()
  })

  it("setOptions with the same key does not resubscribe or duplicate fetches", async () => {
    const store = new QueryStore()
    const queryFn = jest.fn().mockResolvedValue("stable")

    const observer = createQueryObserver({ store, queryKey: ["stable-key"], queryFn })
    await jest.runAllTimersAsync()
    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot(["stable-key"])?.subscribers).toBe(1)

    observer.setOptions({ queryKey: ["stable-key"], queryFn })
    await jest.runAllTimersAsync()

    expect(queryFn).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot(["stable-key"])?.subscribers).toBe(1)

    observer.destroy()
  })
})
