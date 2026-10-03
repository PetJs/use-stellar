import { getHorizonServer, parseHorizonBalance } from "../utils"
import { toStellarError } from "../errors"
import { accountKey } from "../cache/keys"
import type { AccountInfo, NetworkConfig, UseAccountExistsReturn } from "../types"

export { accountKey }

export async function fetchAccount(
  networkConfig: NetworkConfig,
  params: { address: string },
  options: { signal?: AbortSignal } = {}
): Promise<AccountInfo> {
  const { address } = params
  try {
    const server = getHorizonServer(networkConfig)
    const raw = await server.loadAccount(address)

    return {
      address: raw.id,
      sequence: raw.sequenceNumber(),
      balances: raw.balances.map(parseHorizonBalance),
      subentryCount: raw.subentry_count,
      thresholds: {
        lowThreshold: raw.thresholds.low_threshold,
        medThreshold: raw.thresholds.med_threshold,
        highThreshold: raw.thresholds.high_threshold,
      },
      signers: raw.signers.map((s: { key: string; weight: number; type: string }) => ({
        key: s.key,
        weight: s.weight,
        type: s.type,
      })),
    } satisfies AccountInfo
  } catch (err) {
    if (options.signal?.aborted) throw err
    const stellarError = toStellarError(err)
    throw stellarError ?? err
  }
}

export async function fetchAccountExists(
  networkConfig: NetworkConfig,
  params: { address: string },
  options: { signal?: AbortSignal } = {}
): Promise<{ exists: boolean; reason: UseAccountExistsReturn["reason"] }> {
  const { address } = params
  try {
    const server = getHorizonServer(networkConfig)
    await server.loadAccount(address)
    return { exists: true, reason: "exists" as const }
  } catch (err) {
    if (options.signal?.aborted) throw err
    const stellarError = toStellarError(err)
    if (stellarError?.code === "ACCOUNT_NOT_FOUND") {
      return { exists: false, reason: "not_funded" as const }
    }
    throw stellarError ?? err
  }
}
