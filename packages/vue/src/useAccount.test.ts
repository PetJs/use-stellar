import { describe, it, expect, vi } from "vitest"
import { useAccount } from "./useAccount"
import { ref } from "vue"

vi.mock("@use-stellar/core", () => ({
  fetchAccount: vi.fn(),
  accountKey: (...args: any[]) => args,
  toStellarError: (e: any) => e,
}))

vi.mock("./useQuery", () => ({
  useQuery: ({ queryFn }: any) => {
    return {
      data: ref(null),
      loading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    }
  },
}))

vi.mock("./useWallet", () => ({
  useWallet: () => ({ address: ref("G...") }),
}))

describe("useAccount", () => {
  it("initializes correctly", () => {
    const { account, loading, error } = useAccount()
    expect(loading.value).toBe(false)
    expect(account.value).toBeNull()
    expect(error.value).toBeNull()
  })
})
