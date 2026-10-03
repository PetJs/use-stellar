import { SorobanRpc } from "@stellar/stellar-sdk"
import { useContractEvents } from "../index"
import { getAppState, setAppState, renderHookWithStellar, waitFor } from "../test-utils"
import { assertNoDomGlobals } from "../test-utils/platform"

const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"

describe("useContractEvents on React Native", () => {
  const getEvents = jest.fn()
  const getLatestLedger = jest.fn()

  beforeEach(() => {
    getLatestLedger.mockResolvedValue({ sequence: 1000 })
    getEvents.mockResolvedValue({
      latestLedger: 1001,
      events: [
        {
          id: "event-1",
          contractId: CONTRACT_ID,
          ledger: 1001,
          ledgerClosedAt: "2026-09-27T00:00:00Z",
          pagingToken: "token-1",
          topic: ["ok:transfer"],
          value: "ok:10",
        },
      ],
    })
    ;(SorobanRpc.Server as jest.Mock).mockImplementation(() => ({
      getEvents,
      getLatestLedger,
    }))
  })

  it("returns the web hook shape for mocked events", async () => {
    assertNoDomGlobals()
    const { result, unmount } = renderHookWithStellar(() =>
      useContractEvents({ contractIds: [CONTRACT_ID], interval: 60_000 })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
      expect(result.current.events.length).toBeGreaterThan(0)
    })

    expect(result.current.events[0]?.id).toBe("event-1")
    unmount()
  })

  it("keeps the last events when the app is backgrounded", async () => {
    const { result, unmount } = renderHookWithStellar(() =>
      useContractEvents({ contractIds: [CONTRACT_ID], interval: 60_000 })
    )

    await waitFor(() => {
      expect(result.current.events.length).toBeGreaterThan(0)
    })

    const pollsBeforeBackground = getEvents.mock.calls.length
    setAppState("background")
    expect(getAppState()).toBe("background")
    expect(result.current.events[0]?.id).toBe("event-1")
    expect(getEvents).toHaveBeenCalledTimes(pollsBeforeBackground)
    unmount()
  })
})
