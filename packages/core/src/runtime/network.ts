import type { CustomNetworkConfig, NetworkConfig, StellarNetwork } from "../types"
import { NETWORK_CONFIGS } from "../types"

/** Resolve built-in or custom network settings without framework dependencies. */
export function resolveNetworkConfig(
  network: StellarNetwork,
  override?: CustomNetworkConfig
): NetworkConfig {
  const builtIn = network === "custom" ? undefined : NETWORK_CONFIGS[network]
  if (!override) {
    if (!builtIn) {
      throw new Error(
        'use-stellar: network="custom" requires a networkConfig with ' +
          "`horizonUrl`, `sorobanUrl`, and `networkPassphrase`. " +
          'Example: { horizonUrl: "http://localhost:8000", ' +
          'sorobanUrl: "http://localhost:8000/soroban/rpc", ' +
          'networkPassphrase: "Standalone Network ; February 2017" }'
      )
    }
    return builtIn
  }

  const { horizonUrl, sorobanUrl, networkPassphrase } = override
  if (typeof horizonUrl !== "string" || horizonUrl.trim() === "") {
    throw new Error(
      "use-stellar: Invalid networkConfig — `horizonUrl` is required when providing a custom networkConfig. " +
        'Example: { horizonUrl: "https://horizon.my-node.com", sorobanUrl: "..." }'
    )
  }
  if (typeof sorobanUrl !== "string" || sorobanUrl.trim() === "") {
    throw new Error(
      "use-stellar: Invalid networkConfig — `sorobanUrl` is required when providing a custom networkConfig. " +
        'Example: { horizonUrl: "...", sorobanUrl: "https://rpc.my-node.com" }'
    )
  }

  const hasPassphrase = typeof networkPassphrase === "string" && networkPassphrase.trim() !== ""
  if (!hasPassphrase && !builtIn) {
    throw new Error(
      'use-stellar: Invalid networkConfig — `networkPassphrase` is required when network="custom". ' +
        "There is no default passphrase for a network this library ships no configuration for, and " +
        "guessing one would sign transactions that the target network rejects. " +
        'Example: { networkPassphrase: "Standalone Network ; February 2017" }'
    )
  }
  return {
    network,
    horizonUrl: horizonUrl.trim(),
    sorobanUrl: sorobanUrl.trim(),
    networkPassphrase: hasPassphrase ? networkPassphrase.trim() : builtIn!.networkPassphrase,
  }
}
