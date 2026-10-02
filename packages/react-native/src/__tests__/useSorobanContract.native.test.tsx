import { SorobanRpc, xdr } from "@stellar/stellar-sdk"
import { useSorobanContract } from "../index"
import { renderHookWithStellar, waitFor } from "../test-utils"
import { assertNoDomGlobals } from "../test-utils/platform"

const CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"
const i128 = 250n

describe("useSorobanContract on React Native", () => {
  const simulate = jest.fn()

  beforeEach(() => {
    ;(SorobanRpc.Server as jest.Mock).mockImplementation(() => ({
      simulateTransaction: simulate,
    }))
  })

  it("exposes the web hook shape through the RN provider", async () => {
    assertNoDomGlobals()
    simulate.mockResolvedValue({
      result: { retval: xdr.ScVal.scvU32(7) },
    })

    const { result, unmount } = renderHookWithStellar(() =>
      useSorobanContract({
        contractId: CONTRACT_ID,
        method: "balance",
        args: [],
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(typeof result.current.refetch).toBe("function")
    expect("data" in result.current).toBe(true)
    expect("error" in result.current).toBe(true)
    unmount()
  })

  it("serializes BigInt arguments to a stable cache key", async () => {
    simulate.mockResolvedValue({
      result: { retval: xdr.ScVal.scvU32(7) },
    })

    const { result, unmount } = renderHookWithStellar(() => ({
      first: useSorobanContract<number>({
        contractId: CONTRACT_ID,
        method: "balance",
        args: [i128],
      }),
      second: useSorobanContract<number>({
        contractId: CONTRACT_ID,
        method: "balance",
        args: [i128],
      }),
    }))

    await waitFor(() => {
      expect(result.current.first.loading).toBe(false)
      expect(result.current.second.loading).toBe(false)
    })

    expect(result.current.first.error?.message).toContain("bigint")
    expect(result.current.second.error?.message).toBe(result.current.first.error?.message)
    expect(simulate).not.toHaveBeenCalled()
    unmount()
  })
})
