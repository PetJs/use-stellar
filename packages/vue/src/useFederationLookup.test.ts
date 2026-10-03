import { describe, it, expect, vi } from "vitest"
import { useFederationLookup } from "./useFederationLookup"
import { ref } from "vue"

vi.mock("@use-stellar/core", () => ({
  fetchFederationLookup: vi.fn(),
  federationKey: (address: string) => ["federation", address],
  toStellarError: (e: unknown) => e,
  createStellarError: (code: string, message: string) => ({ code, message }),
}))

vi.mock("./useQuery", () => ({
  useQuery: vi.fn((_opts: unknown) => {
    return {
      data: ref({ accountId: "G...", memoType: "text", memo: "memo" }),
      loading: ref(false),
      error: ref(null),
      refetch: vi.fn(),
    }
  }),
}))

import { useQuery } from "./useQuery"

describe("useFederationLookup", () => {
  it("initializes correctly with static input", () => {
    const { record, loading, error } = useFederationLookup({ address: "alice*stellar.org" })
    expect(loading.value).toBe(false)
    expect(record.value).toEqual({ accountId: "G...", memoType: "text", memo: "memo" })
    expect(error.value).toBeNull()

    const queryOpts = vi.mocked(useQuery).mock.calls[0][0]
    expect(queryOpts.queryKey.value).toEqual(["federation", "alice*stellar.org"])
    expect(queryOpts.enabled.value).toBe(true)
  })

  it("handles reactive ref input", () => {
    const address = ref("bob*stellar.org")
    useFederationLookup({ address })

    const queryOpts = vi.mocked(useQuery).mock.calls[vi.mocked(useQuery).mock.calls.length - 1][0]
    expect(queryOpts.queryKey.value).toEqual(["federation", "bob*stellar.org"])
    expect(queryOpts.enabled.value).toBe(true)

    address.value = "carol*stellar.org"
    expect(queryOpts.queryKey.value).toEqual(["federation", "carol*stellar.org"])
  })

  it("handles getter input", () => {
    let addressStr = "dave*stellar.org"
    useFederationLookup({ address: () => addressStr })

    const queryOpts = vi.mocked(useQuery).mock.calls[vi.mocked(useQuery).mock.calls.length - 1][0]
    expect(queryOpts.queryKey.value).toEqual(["federation", "dave*stellar.org"])

    addressStr = "eve*stellar.org"
    expect(queryOpts.queryKey.value).toEqual(["federation", "eve*stellar.org"])
  })

  it("handles idle (null/empty) input", () => {
    const { error } = useFederationLookup({ address: "" })

    const queryOpts = vi.mocked(useQuery).mock.calls[vi.mocked(useQuery).mock.calls.length - 1][0]
    expect(queryOpts.queryKey.value).toEqual(["federation", "disabled"])
    expect(queryOpts.enabled.value).toBe(false)

    expect(error.value).toBeNull()
  })

  it("returns validation error on invalid address", () => {
    const { error } = useFederationLookup({ address: "invalid-address" })

    expect(error.value).toEqual({
      code: "VALIDATION_ERROR",
      message: "Federated address must be in the form name*domain.",
    })

    const queryOpts = vi.mocked(useQuery).mock.calls[vi.mocked(useQuery).mock.calls.length - 1][0]
    expect(queryOpts.queryKey.value).toEqual(["federation", "disabled"])
    expect(queryOpts.enabled.value).toBe(false)
  })
})
