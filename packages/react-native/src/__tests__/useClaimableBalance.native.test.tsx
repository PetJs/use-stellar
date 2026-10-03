import { mockHorizonServer, TESTNET_ADDRESS_A } from "@stellar/stellar-sdk"
import { useClaimableBalance } from "../index"
import { renderHookWithStellar, waitFor } from "../test-utils"
import { assertNoDomGlobals } from "../test-utils/platform"

describe("useClaimableBalance on React Native", () => {
  it("returns mocked claimable balances", async () => {
    assertNoDomGlobals()
    mockHorizonServer.claimableBalances.mockReturnValue({
      claimant: () => ({
        call: jest.fn().mockResolvedValue({
          records: [
            {
              id: "claimable-1",
              asset: "native",
              amount: "10.0000000",
              claimants: [{ destination: TESTNET_ADDRESS_A, predicate: { unconditional: true } }],
            },
          ],
        }),
      }),
    })

    const { result, unmount } = renderHookWithStellar(() =>
      useClaimableBalance({ address: TESTNET_ADDRESS_A })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.balances).toHaveLength(1)
    expect(result.current.balances[0]?.id).toBe("claimable-1")
    unmount()
  })
})
