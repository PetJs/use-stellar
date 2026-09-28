import { getHorizonServer } from "../utils"
import { toStellarError } from "../errors"
import type { NetworkConfig, NormalizedTransaction } from "../types"
import type { Horizon } from "@stellar/stellar-sdk"
import { splitOverfetchedPage } from "./pagination"

export type TransactionRecord = Horizon.ServerApi.TransactionRecord
export type TransactionPage = Horizon.ServerApi.CollectionPage<TransactionRecord>

export interface FetchTransactionHistoryPageParams {
  address: string
  limit: number
  order: "asc" | "desc"
  cursor?: string
}

export interface TransactionHistoryPageResult {
  records: NormalizedTransaction[]
  nextCursor: () => Promise<TransactionPage>
  prevCursor: () => Promise<TransactionPage>
  hasNext: boolean
  hasPrev: boolean
}

/**
 * Fetches one page of an account's transaction history from Horizon,
 * normalizing records and deriving pagination state.
 *
 * Framework-neutral: no React/Vue imports, no cache access. Errors are mapped
 * through `toStellarError` so both frameworks surface identical codes.
 */
export async function fetchTransactionHistoryPage(
  networkConfig: NetworkConfig,
  params: FetchTransactionHistoryPageParams,
  options: { signal?: AbortSignal } = {}
): Promise<TransactionHistoryPageResult> {
  const { address, limit, order, cursor } = params
  try {
    const server = getHorizonServer(networkConfig)
    // Ask for one more than requested: see splitOverfetchedPage.
    let query = server
      .transactions()
      .forAccount(address)
      .limit(limit + 1)
      .order(order)
    if (cursor) query = query.cursor(cursor)

    const res = await query.call()
    const { records, hasNext, hasPrev } = splitOverfetchedPage(res.records, limit, !!cursor)
    const normalized = records.map(normalizeTransaction)

    return {
      records: normalized,
      nextCursor: () => res.next(),
      prevCursor: () => res.prev(),
      hasNext,
      hasPrev,
    }
  } catch (err) {
    if (options.signal?.aborted) throw err
    const stellarError = toStellarError(err)
    throw stellarError ?? err
  }
}

/** Converts a raw Horizon transaction record into a `NormalizedTransaction`. */
export function normalizeTransaction(record: TransactionRecord): NormalizedTransaction {
  return {
    hash: record.hash,
    ledger: Number(record.ledger),
    createdAt: record.created_at,
    sourceAccount: record.source_account,
    fee: String(record.fee_charged),
    operationCount: record.operation_count,
    successful: record.successful,
    memo: record.memo,
    memoType: record.memo_type,
  }
}
