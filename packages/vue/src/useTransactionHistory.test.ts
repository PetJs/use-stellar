import { describe, it, expect, vi } from "vitest"
import { useTransactionHistory } from "./useTransactionHistory"
import { ref } from "vue"

vi.mock("@use-stellar/core", () => ({
  fetchTransactionHistoryPage: vi.fn(),
  transactionHistoryKey: (...args: unknown[]) => args,
  toStellarError: (e: unknown) => e,
  getNextCursor: () => "next",
  getPrevCursor: () => "prev",
}))

vi.mock("./useQuery", () => ({
  useQuery: () => {
    return {
      data: ref({ records: [], hasNext: false, hasPrev: false }),
      loading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    }
  },
}))

vi.mock("./useWallet", () => ({
  useWallet: () => ({ address: ref("G...") }),
}))

describe("useTransactionHistory", () => {
  it("initializes and respects options", () => {
    const address = ref("G123")
    const { transactions, loading, hasNext } = useTransactionHistory({ address })
    expect(loading.value).toBe(false)
    expect(transactions.value).toEqual([])
    expect(hasNext.value).toBe(false)
  })
})
