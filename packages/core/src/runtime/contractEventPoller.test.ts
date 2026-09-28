/**
 * Tests for the framework-neutral contract event poller extracted from
 * useContractEvents.
 *
 * Plain TypeScript, fake timers, mocked RPC transport, no DOM/React.
 */

interface StubEvent {
  id: string
  contractId: string
  ledger: number
  ledgerClosedAt: string
  pagingToken: string
  topic: string[]
  value: string
}

let responseQueue: { events: StubEvent[]; latestLedger: number }[] = []
let getEventsCalls: { filters: unknown[]; startLedger?: number; cursor?: string }[] = []
let getEventsError: Error | null = null
let latestLedgerCalls = 0
/** Lets a test hold a `getEvents` call open until it resolves it manually. */
let pendingResolvers: ((value: { events: StubEvent[]; latestLedger: number }) => void)[] = []
let holdNextResponse = false

jest.mock("@stellar/stellar-sdk", () => {
  class MockServer {
    async getLatestLedger() {
      latestLedgerCalls += 1
      return { sequence: 1000 }
    }

    async getEvents(request: { filters: unknown[]; startLedger?: number; cursor?: string }) {
      getEventsCalls.push(request)
      if (getEventsError) throw getEventsError

      if (holdNextResponse) {
        holdNextResponse = false
        return new Promise(resolve => {
          pendingResolvers.push(resolve)
        })
      }

      return responseQueue.shift() ?? { events: [], latestLedger: 1000 }
    }
  }

  return {
    SorobanRpc: { Server: MockServer },
    scValToNative: (value: { decoded?: unknown; fail?: boolean }) => {
      if (value?.fail) throw new Error("unknown ScVal discriminant")
      return value?.decoded
    },
    xdr: {
      ScVal: {
        fromXDR: (raw: string) =>
          raw.startsWith("UNDECODABLE")
            ? { fail: true, toXDR: () => raw }
            : { decoded: raw.replace(/^ok:/, ""), toXDR: () => raw },
      },
    },
  }
})

import { createContractEventPoller } from "./contractEventPoller"

const CONTRACT_A = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"

const networkConfig = { sorobanUrl: "https://soroban-testnet.stellar.org" }

/** Flushes microtasks so the poller's initial synchronous poll() settles, without advancing any timer (which would also fire the interval). */
async function flushInitialPoll(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function stubEvent(overrides: Partial<StubEvent> & { id: string }): StubEvent {
  return {
    contractId: CONTRACT_A,
    ledger: 1001,
    ledgerClosedAt: "2026-08-27T00:00:00Z",
    pagingToken: `token-${overrides.id}`,
    topic: ["ok:transfer"],
    value: "ok:100",
    ...overrides,
  }
}

beforeEach(() => {
  jest.useFakeTimers()
  responseQueue = []
  getEventsCalls = []
  getEventsError = null
  latestLedgerCalls = 0
  pendingResolvers = []
  holdNextResponse = false
})

afterEach(() => {
  jest.useRealTimers()
})

describe("createContractEventPoller — successful simulation/fetch and decoding", () => {
  it("decodes topics and value, exposing raw XDR alongside", async () => {
    responseQueue = [
      {
        events: [stubEvent({ id: "1", topic: ["ok:transfer", "ok:from"], value: "ok:250" })],
        latestLedger: 1001,
      },
    ]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 10_000,
    })
    poller.start()
    await flushInitialPoll()

    const snapshot = poller.getSnapshot()
    expect(snapshot.events).toHaveLength(1)
    expect(snapshot.events[0].topics).toEqual(["transfer", "from"])
    expect(snapshot.events[0].value).toBe("250")
    expect(snapshot.events[0].raw).toEqual({ topics: ["ok:transfer", "ok:from"], value: "ok:250" })
    expect(snapshot.latestLedger).toBe(1001)

    poller.stop()
  })

  it("falls back to raw XDR when a value cannot be decoded", async () => {
    responseQueue = [
      { events: [stubEvent({ id: "1", value: "UNDECODABLE-x" })], latestLedger: 1001 },
    ]

    const poller = createContractEventPoller(networkConfig, { contractIds: [CONTRACT_A] })
    poller.start()
    await flushInitialPoll()

    const event = poller.getSnapshot().events[0]
    expect(event.raw.value).toBe("UNDECODABLE-x")
    expect(event.decodeFailed).toBe(true)
    expect(poller.getSnapshot().error).toBeNull()

    poller.stop()
  })
})

describe("createContractEventPoller — start-ledger tracking", () => {
  it("starts from the RPC's latest ledger when no startLedger is given", async () => {
    responseQueue = [{ events: [], latestLedger: 1000 }]

    const poller = createContractEventPoller(networkConfig, { contractIds: [CONTRACT_A] })
    poller.start()
    await flushInitialPoll()

    expect(latestLedgerCalls).toBe(1)
    expect(getEventsCalls[0].startLedger).toBe(1000)

    poller.stop()
  })

  it("honours an explicit startLedger without asking for the latest", async () => {
    responseQueue = [{ events: [], latestLedger: 1000 }]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      startLedger: 900,
    })
    poller.start()
    await jest.runOnlyPendingTimersAsync()

    expect(getEventsCalls[0].startLedger).toBe(900)
    expect(latestLedgerCalls).toBe(0)

    poller.stop()
  })
})

describe("createContractEventPoller — cursor advancement", () => {
  it("advances the cursor between polls instead of re-reading from startLedger", async () => {
    responseQueue = [
      { events: [stubEvent({ id: "1", pagingToken: "token-1" })], latestLedger: 1001 },
      { events: [stubEvent({ id: "2", pagingToken: "token-2" })], latestLedger: 1002 },
    ]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 20,
    })
    poller.start()
    await jest.advanceTimersByTimeAsync(20)

    expect(getEventsCalls.length).toBeGreaterThanOrEqual(2)
    expect(getEventsCalls[0].startLedger).toBe(1000)
    expect(getEventsCalls[0].cursor).toBeUndefined()
    expect(getEventsCalls[1].cursor).toBe("token-1")
    expect(getEventsCalls[1].startLedger).toBeUndefined()

    expect(poller.getSnapshot().events.map(e => e.id)).toEqual(["1", "2"])

    poller.stop()
  })

  it("does not deliver the same event twice when a provider replays it", async () => {
    const replayed = stubEvent({ id: "1", pagingToken: "token-1" })
    responseQueue = [
      { events: [replayed], latestLedger: 1001 },
      { events: [replayed, stubEvent({ id: "2", pagingToken: "token-2" })], latestLedger: 1002 },
    ]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 20,
    })
    poller.start()
    await jest.advanceTimersByTimeAsync(20)

    expect(poller.getSnapshot().events.map(e => e.id)).toEqual(["1", "2"])

    poller.stop()
  })
})

describe("createContractEventPoller — topic filtering", () => {
  it("passes the topics filter through to getEvents", async () => {
    responseQueue = [{ events: [], latestLedger: 1000 }]
    const topics = [["ok:transfer"]]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      topics,
    })
    poller.start()
    await jest.runOnlyPendingTimersAsync()

    expect((getEventsCalls[0].filters[0] as { topics?: unknown }).topics).toEqual(topics)

    poller.stop()
  })
})

describe("createContractEventPoller — retention window / error handling", () => {
  it("reports a too-old startLedger as LEDGER_OUT_OF_RETENTION", async () => {
    getEventsError = new Error(
      "start ledger 1 is before the oldest ledger available on this server (12345)"
    )

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      startLedger: 1,
    })
    poller.start()
    await jest.runOnlyPendingTimersAsync()

    expect(poller.getSnapshot().error?.code).toBe("LEDGER_OUT_OF_RETENTION")

    poller.stop()
  })

  it("classifies an unrelated RPC failure normally", async () => {
    getEventsError = new Error("Network Error")

    const poller = createContractEventPoller(networkConfig, { contractIds: [CONTRACT_A] })
    poller.start()
    await jest.runOnlyPendingTimersAsync()

    expect(poller.getSnapshot().error?.code).toBe("NETWORK_ERROR")

    poller.stop()
  })
})

describe("createContractEventPoller — lifecycle: start/stop/repeated start", () => {
  it("start() is idempotent — calling it while already running does not create a second timer", async () => {
    responseQueue = [{ events: [], latestLedger: 1000 }]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 1_000,
    })
    poller.start()
    await jest.runOnlyPendingTimersAsync()
    const callsAfterFirstStart = getEventsCalls.length

    poller.start()
    poller.start()

    await jest.advanceTimersByTimeAsync(1_000)

    // One more poll from the single active interval, not one per extra start() call.
    expect(getEventsCalls.length).toBe(callsAfterFirstStart + 1)

    poller.stop()
  })

  it("stop() clears the timer and prevents further polling", async () => {
    responseQueue = [{ events: [], latestLedger: 1000 }]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 20,
    })
    poller.start()
    await jest.advanceTimersByTimeAsync(20)
    const callsAtStop = getEventsCalls.length

    poller.stop()
    await jest.advanceTimersByTimeAsync(200)

    expect(getEventsCalls.length).toBe(callsAtStop)
  })

  it("a late result after stop() does not publish into the stopped poller", async () => {
    holdNextResponse = true

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 10_000,
    })
    poller.start()

    // Let the in-flight getEvents() call register, then stop before it resolves.
    await Promise.resolve()
    await Promise.resolve()

    poller.stop()
    expect(poller.getSnapshot().loading).toBe(false)

    // Now resolve the held RPC call — this is the race: request started before
    // stop(), resolves after.
    const resolve = pendingResolvers.pop()
    resolve?.({ events: [stubEvent({ id: "late" })], latestLedger: 9999 })
    await jest.runAllTimersAsync()

    // The late result must not have published into the stopped poller.
    expect(poller.getSnapshot().events).toHaveLength(0)
    expect(poller.getSnapshot().latestLedger).toBeNull()
    expect(poller.getSnapshot().loading).toBe(false)
  })

  it("restarting after stop resumes fresh polling", async () => {
    responseQueue = [{ events: [], latestLedger: 1000 }]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 1_000,
    })
    poller.start()
    await jest.runOnlyPendingTimersAsync()
    poller.stop()

    responseQueue = [{ events: [stubEvent({ id: "after-restart" })], latestLedger: 1002 }]
    poller.start()
    await jest.runOnlyPendingTimersAsync()

    expect(poller.getSnapshot().events.map(e => e.id)).toEqual(["after-restart"])

    poller.stop()
  })
})

describe("createContractEventPoller — clear()", () => {
  it("empties the buffer without stopping the subscription", async () => {
    responseQueue = [{ events: [stubEvent({ id: "1" })], latestLedger: 1001 }]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 10_000,
    })
    poller.start()
    await jest.runOnlyPendingTimersAsync()
    expect(poller.getSnapshot().events).toHaveLength(1)

    poller.clear()
    expect(poller.getSnapshot().events).toEqual([])

    // Subsequent polling still runs — clear() did not restart or stop it.
    responseQueue = [{ events: [stubEvent({ id: "2", pagingToken: "t2" })], latestLedger: 1002 }]
    await jest.advanceTimersByTimeAsync(10_000)

    expect(poller.getSnapshot().events.map(e => e.id)).toEqual(["2"])

    poller.stop()
  })
})

describe("createContractEventPoller — buffer limits", () => {
  it("enforces bufferSize, dropping the oldest events first", async () => {
    responseQueue = [
      {
        events: [
          stubEvent({ id: "1", pagingToken: "t1" }),
          stubEvent({ id: "2", pagingToken: "t2" }),
          stubEvent({ id: "3", pagingToken: "t3" }),
        ],
        latestLedger: 1001,
      },
    ]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      bufferSize: 2,
      interval: 10_000,
    })
    poller.start()
    await jest.runOnlyPendingTimersAsync()

    expect(poller.getSnapshot().events.map(e => e.id)).toEqual(["2", "3"])

    poller.stop()
  })

  it("never grows the buffer past bufferSize across multiple polls", async () => {
    responseQueue = [
      { events: [stubEvent({ id: "1", pagingToken: "t1" })], latestLedger: 1001 },
      { events: [stubEvent({ id: "2", pagingToken: "t2" })], latestLedger: 1002 },
      { events: [stubEvent({ id: "3", pagingToken: "t3" })], latestLedger: 1003 },
    ]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      bufferSize: 2,
      interval: 20,
    })
    poller.start()
    await jest.advanceTimersByTimeAsync(60)

    expect(poller.getSnapshot().events.length).toBeLessThanOrEqual(2)

    poller.stop()
  })
})

describe("createContractEventPoller — interval validation", () => {
  it("falls back to the default interval for a non-positive interval", async () => {
    responseQueue = [{ events: [], latestLedger: 1000 }]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 0,
    })
    poller.start()
    await jest.runOnlyPendingTimersAsync()
    const callsAfterFirst = getEventsCalls.length

    // Should not busy-loop: advancing less than the default interval (5s)
    // produces no additional call.
    await jest.advanceTimersByTimeAsync(1_000)
    expect(getEventsCalls.length).toBe(callsAfterFirst)

    poller.stop()
  })

  it("falls back to the default interval for a negative interval", async () => {
    responseQueue = [{ events: [], latestLedger: 1000 }]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: -50,
    })
    poller.start()
    await jest.runOnlyPendingTimersAsync()
    const callsAfterFirst = getEventsCalls.length

    await jest.advanceTimersByTimeAsync(1_000)
    expect(getEventsCalls.length).toBe(callsAfterFirst)

    poller.stop()
  })
})

describe("createContractEventPoller — subscribe", () => {
  it("notifies subscribers with each snapshot change", async () => {
    responseQueue = [{ events: [stubEvent({ id: "1" })], latestLedger: 1001 }]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 10_000,
    })
    const listener = jest.fn()
    poller.subscribe(listener)

    poller.start()
    await jest.runOnlyPendingTimersAsync()

    expect(listener).toHaveBeenCalled()
    const last = listener.mock.calls[listener.mock.calls.length - 1][0]
    expect(last.events).toHaveLength(1)

    poller.stop()
  })

  it("unsubscribe stops further notifications", async () => {
    responseQueue = [{ events: [], latestLedger: 1000 }]

    const poller = createContractEventPoller(networkConfig, {
      contractIds: [CONTRACT_A],
      interval: 20,
    })
    const listener = jest.fn()
    const unsubscribe = poller.subscribe(listener)

    poller.start()
    await jest.advanceTimersByTimeAsync(20)
    unsubscribe()
    const callsBefore = listener.mock.calls.length

    await jest.advanceTimersByTimeAsync(100)

    expect(listener.mock.calls.length).toBe(callsBefore)

    poller.stop()
  })
})
