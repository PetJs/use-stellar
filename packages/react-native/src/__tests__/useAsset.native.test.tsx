import { mockHorizonServer } from "@stellar/stellar-sdk"
import { useAsset } from "../index"
import { renderHookWithStellar, waitFor } from "../test-utils"
import { assertNoDomGlobals } from "../test-utils/platform"

const USDC_ISSUER = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN"

describe("useAsset on React Native", () => {
  it("returns mocked asset metadata", async () => {
    assertNoDomGlobals()
    mockHorizonServer.assets.mockReturnValue({
      forCode: () => ({
        forIssuer: () => ({
          call: jest.fn().mockResolvedValue({
            records: [
              {
                asset_code: "USDC",
                asset_issuer: USDC_ISSUER,
                amount: "1000000.0000000",
                num_accounts: 100,
                flags: { auth_required: false, auth_revocable: false, auth_immutable: true },
              },
            ],
          }),
        }),
      }),
    })

    const { result, unmount } = renderHookWithStellar(() =>
      useAsset({ code: "USDC", issuer: USDC_ISSUER })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.asset).toEqual(
      expect.objectContaining({
        code: "USDC",
        issuer: USDC_ISSUER,
        supply: "1000000.0000000",
      })
    )
    unmount()
  })
})
