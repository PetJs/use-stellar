import { describe, it, expect, vi } from "vitest"
import { useAnchor } from "./useAnchor"
import { ref } from "vue"

// @ts-expect-error -- "@use-stellar/core" is not resolvable from this package yet (Vue WIP)
import { fetchAnchorInfo } from "@use-stellar/core"

vi.mock("@use-stellar/core", async () => ({
  fetchAnchorInfo: vi.fn(),
  toStellarError: (err: unknown) => err,
}))

describe("useAnchor", () => {
  it("resolves mocked stellar.toml", async () => {
    vi.mocked(fetchAnchorInfo).mockResolvedValueOnce({
      signingKey: "G...",
      webAuthEndpoint: "https://example.com/auth",
      transferServer: "https://example.com/transfer",
      transferServerSep24: "https://example.com/sep24",
      kycServer: "https://example.com/kyc",
      currencies: [],
    } as never)

    const domain = ref("example.com")
    const { anchor, loading, error } = useAnchor({ domain })

    expect(loading.value).toBe(true)

    // allow microtasks to flush
    await new Promise(r => setTimeout(r, 0))

    expect(loading.value).toBe(false)
    expect(anchor.value).toBeDefined()
    expect(error.value).toBeNull()
  })
})
