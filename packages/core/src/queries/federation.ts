import { Federation } from "@stellar/stellar-sdk"
import { toStellarError } from "../errors"
import { federationKey } from "../cache/keys"
import type { FederationRecord } from "../types"

export { federationKey }

export async function fetchFederationLookup(
  params: { address: string },
  options: { signal?: AbortSignal } = {}
): Promise<FederationRecord> {
  const { address } = params
  try {
    const raw = await Federation.Server.resolve(address)
    return {
      stellarAddress: address,
      accountId: raw.account_id,
      memoType: raw.memo_type ?? undefined,
      memo: raw.memo ?? undefined,
    }
  } catch (err) {
    if (options.signal?.aborted) throw err
    const stellarError = toStellarError(err)
    throw stellarError ?? err
  }
}
