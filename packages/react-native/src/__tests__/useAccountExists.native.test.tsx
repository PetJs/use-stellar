import { mockAccountData, mockHorizonServer, TESTNET_ADDRESS_A } from "@stellar/stellar-sdk"
import { useAccountExists } from "../index"
import { renderHookWithStellar, waitFor } from "../test-utils"
import { assertNoDomGlobals } from "../test-utils/platform"

describe("useAccountExists on React Native", () => {
  it("returns exists for a mocked Horizon account", async () => {
    assertNoDomGlobals()
    mockHorizonServer.loadAccount.mockResolvedValue(mockAccountData)

    const { result, unmount } = renderHookWithStellar(() =>
      useAccountExists({ address: TESTNET_ADDRESS_A })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.exists).toBe(true)
    expect(result.current.reason).toBe("exists")
    unmount()
  })
})
