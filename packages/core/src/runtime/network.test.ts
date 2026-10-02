import { resolveNetworkConfig } from "./network"
import { NETWORK_CONFIGS } from "../types"

describe("resolveNetworkConfig", () => {
  it("returns built-in network defaults", () => {
    expect(resolveNetworkConfig("testnet")).toEqual(NETWORK_CONFIGS.testnet)
  })

  it("trims and resolves an override for a built-in network", () => {
    expect(
      resolveNetworkConfig("testnet", {
        horizonUrl: " https://horizon.example ",
        sorobanUrl: " https://rpc.example ",
      })
    ).toEqual({ ...NETWORK_CONFIGS.testnet, horizonUrl: "https://horizon.example", sorobanUrl: "https://rpc.example" })
  })

  it("requires a passphrase for custom networks", () => {
    expect(() =>
      resolveNetworkConfig("custom", { horizonUrl: "h", sorobanUrl: "s" })
    ).toThrow("networkPassphrase")
  })
})
