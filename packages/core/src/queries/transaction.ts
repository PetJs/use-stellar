import { getHorizonServer } from "../utils"
import { toStellarError } from "../errors"
import { transactionKey } from "../cache/keys"
import type { NetworkConfig, TransactionResult, TransactionStatus } from "../types"

export { transactionKey }

export async function fetchTransaction(
  networkConfig: NetworkConfig,
  params: { hash: string; watch?: boolean },
  options: { signal?: AbortSignal } = {}
): Promise<TransactionResult> {
  const { hash, watch } = params
  try {
    const server = getHorizonServer(networkConfig)
    const raw = await server.transactions().transaction(hash).call()
    const status: TransactionStatus = raw.successful ? "success" : "failed"
    return {
      hash: raw.hash,
      status,
      ledger: Number(raw.ledger),
      createdAt: raw.created_at,
      fee: String(raw.fee_charged),
      envelope: raw.envelope_xdr,
    }
  } catch (err) {
    if (options.signal?.aborted) throw err
    const is404 = (err as { response?: { status: number } })?.response?.status === 404
    if (is404) {
      return {
        hash,
        status: watch ? ("pending" as TransactionStatus) : ("not_found" as TransactionStatus),
      }
    }
    const stellarError = toStellarError(err)
    throw stellarError ?? err
  }
}
