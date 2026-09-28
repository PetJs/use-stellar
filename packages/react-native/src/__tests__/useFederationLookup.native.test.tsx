import { TESTNET_ADDRESS_A } from "@stellar/stellar-sdk"
import { useFederationLookup } from "../index"
import { renderHookWithStellar, waitFor } from "../test-utils"
import { assertNoDomGlobals } from "../test-utils/platform"

const mockResolve = jest.fn()

jest.mock("@stellar/stellar-sdk", () => {
  const actual = jest.requireActual("@stellar/stellar-sdk")
  return {
    ...actual,
    Federation: {
      Server: {
        resolve: (...args: unknown[]) => mockResolve(...args),
      },
    },
  }
})

describe("useFederationLookup on React Native", () => {
  it("resolves a federated address from the mocked federation server", async () => {
    assertNoDomGlobals()
    mockResolve.mockResolvedValue({
      account_id: TESTNET_ADDRESS_A,
      stellar_address: "alice*example.com",
      memo_type: "text",
      memo: "hello",
    })

    const { result, unmount } = renderHookWithStellar(() =>
      useFederationLookup({ address: "alice*example.com" })
    )

    await waitFor(() => {
      expect(result.current.record).not.toBeNull()
    })

    expect(result.current.record?.accountId).toBe(TESTNET_ADDRESS_A)
    unmount()
  })
})
