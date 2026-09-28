import {
  Horizon,
  mockAccountData,
  mockHorizonServer,
  TESTNET_ADDRESS_A,
} from "@stellar/stellar-sdk"
import { useAccount, useBalance } from "../index"
import { renderHookWithStellar, waitFor } from "../test-utils"
import { assertNoDomGlobals } from "../test-utils/platform"

describe("useBalance on React Native", () => {
  it("returns the mocked XLM balance and shares the account cache", async () => {
    assertNoDomGlobals()
    mockHorizonServer.loadAccount.mockResolvedValue(mockAccountData)

    const { result, unmount } = renderHookWithStellar(() => ({
      balance: useBalance({ address: TESTNET_ADDRESS_A, asset: "XLM" }),
      account: useAccount({ address: TESTNET_ADDRESS_A }),
    }))

    await waitFor(() => {
      expect(result.current.balance.loading).toBe(false)
      expect(result.current.account.loading).toBe(false)
    })

    expect(result.current.balance.balance).toBe("100.0000000")
    expect(result.current.account.account?.address).toBe(TESTNET_ADDRESS_A)
    expect(mockHorizonServer.loadAccount).toHaveBeenCalledTimes(1)
    unmount()
  })
})
