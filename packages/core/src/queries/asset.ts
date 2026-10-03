import { getHorizonServer } from "../utils"
import { createStellarError, toStellarError } from "../errors"
import { assetKey } from "../cache/keys"
import type { NetworkConfig } from "../types"

export { assetKey }

export interface AssetInfo {
  code: string
  issuer: string
  supply: string
  homeDomain?: string
  numAccounts: number
  flags: {
    authRequired: boolean
    authRevocable: boolean
    authImmutable: boolean
  }
}

export async function fetchAsset(
  networkConfig: NetworkConfig,
  params: { code: string; issuer: string },
  options: { signal?: AbortSignal } = {}
): Promise<AssetInfo> {
  const { code, issuer } = params
  try {
    const server = getHorizonServer(networkConfig)
    const res = await server.assets().forCode(code).forIssuer(issuer).call()

    const raw = res.records[0]
    if (!raw) {
      throw createStellarError("ASSET_NOT_FOUND", `Asset ${code}:${issuer} not found.`)
    }
    const assetRecord = raw as typeof raw & { home_domain?: string }

    return {
      code: raw.asset_code,
      issuer: raw.asset_issuer,
      supply: raw.amount,
      numAccounts: raw.num_accounts,
      homeDomain: assetRecord.home_domain,
      flags: {
        authRequired: raw.flags.auth_required,
        authRevocable: raw.flags.auth_revocable,
        authImmutable: raw.flags.auth_immutable,
      },
    }
  } catch (err) {
    if (options.signal?.aborted) throw err
    const stellarError = toStellarError(err)
    throw stellarError ?? err
  }
}
