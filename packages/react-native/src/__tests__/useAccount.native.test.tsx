import {
  Horizon,
  mockAccountData,
  mockHorizonServer,
  TESTNET_ADDRESS_A,
} from "@stellar/stellar-sdk"
import { useAccount } from "../index"
import { renderHookWithStellar, waitFor } from "../test-utils"
import { assertNoDomGlobals } from "../test-utils/platform"

describe("useAccount on React Native", () => {
  it("returns mocked account data and honours allowHttp on a custom horizon", async () => {
    assertNoDomGlobals()
    mockHorizonServer.loadAccount.mockResolvedValue(mockAccountData)

    const { result, unmount } = renderHookWithStellar(
      () => useAccount({ address: TESTNET_ADDRESS_A }),
      {
        network: "custom",
        networkConfig: {
          horizonUrl: "http://127.0.0.1:8000",
          sorobanUrl: "http://127.0.0.1:8000/soroban/rpc",
          networkPassphrase: "Standalone Network ; February 2017",
        },
      }
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.account?.address).toBe(TESTNET_ADDRESS_A)
    expect(Horizon.Server).toHaveBeenCalledWith(
      "http://127.0.0.1:8000",
      expect.objectContaining({ allowHttp: true })
    )
    unmount()
  })
})
