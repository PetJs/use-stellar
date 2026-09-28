import { Asset as StellarAsset } from "@stellar/stellar-sdk"
import { getHorizonServer, isNativeAsset, isIssuedAsset } from "../utils"
import { createStellarError, toStellarError } from "../errors"
import type { Asset, NetworkConfig, NormalizedTrade } from "../types"
import type { Horizon } from "@stellar/stellar-sdk"

export type TradeRecord = Horizon.ServerApi.TradeRecord

export interface FetchTradesPageParams {
  address?: string | null
  baseAsset?: Asset | null
  counterAsset?: Asset | null
  limit: number
  order: "asc" | "desc"
}

export interface TradesPageResult {
  records: NormalizedTrade[]
  nextCursor: (() => Promise<Horizon.ServerApi.CollectionPage<TradeRecord>>) | null
  prevCursor: (() => Promise<Horizon.ServerApi.CollectionPage<TradeRecord>>) | null
  hasNext: boolean
  hasPrev: boolean
}

/**
 * Fetches one page of executed trades from Horizon, normalizing records
 * with the requested-base orientation rule. See `normalizeTrade`.
 *
 * Framework-neutral: no React/Vue imports, no cache access. Errors are mapped
 * through `toStellarError` so both frameworks surface identical codes.
 *
 * Note: unlike `fetchPaymentsPage`/`fetchTransactionHistoryPage`, Horizon's
 * `/trades` endpoint has no natural "ask for one more" over-fetch signal in
 * this hook's existing behavior, so `hasNext` is derived from
 * `records.length >= limit` (preserving the current, imperfect behavior
 * rather than changing pagination semantics in this extraction).
 */
export async function fetchTradesPage(
  networkConfig: NetworkConfig,
  params: FetchTradesPageParams,
  options: { signal?: AbortSignal } = {}
): Promise<TradesPageResult> {
  const { address, baseAsset, counterAsset, limit, order } = params
  try {
    const server = getHorizonServer(networkConfig)
    let query = server.trades().limit(limit).order(order)

    if (address) {
      query = query.forAccount(address)
    }

    if (baseAsset && counterAsset) {
      const sdkBase = assetToSdkAsset(baseAsset)
      const sdkCounter = assetToSdkAsset(counterAsset)
      query = query.forAssetPair(sdkBase, sdkCounter)
    }

    const res = await query.call()
    const normalized = res.records.map(rec =>
      normalizeTrade(rec, address ?? null, baseAsset ?? null)
    )

    return {
      records: normalized,
      nextCursor: res.records.length > 0 ? () => res.next() : null,
      prevCursor: res.records.length > 0 ? () => res.prev() : null,
      hasNext: res.records.length >= limit,
      hasPrev: false,
    }
  } catch (err) {
    if (options.signal?.aborted) throw err
    const stellarError = toStellarError(err)
    throw stellarError ?? err
  }
}

/**
 * Convert a use-stellar `Asset` to a stable string key for memoization.
 * Object references are not stable across renders; primitives are.
 */
export function assetToKey(asset: Asset | undefined | null): string {
  if (!asset) return ""
  if (!isIssuedAsset(asset)) return asset
  return `${asset.code}:${asset.issuer}`
}

/**
 * Convert a use-stellar `Asset` to the `@stellar/stellar-sdk` `Asset` class
 * required by `TradesCallBuilder#forAssetPair`.
 */
export function assetToSdkAsset(asset: Asset): StellarAsset {
  if (isNativeAsset(asset)) return StellarAsset.native()
  // Pool shares are not a tradable side of a market.
  if (!isIssuedAsset(asset)) {
    throw createStellarError(
      "VALIDATION_ERROR",
      `Unsupported asset for a trade pair: ${JSON.stringify(asset)}. Pass "XLM" or { code, issuer }.`
    )
  }
  return new StellarAsset(asset.code, asset.issuer)
}

/** Parse a raw Horizon asset into a use-stellar `Asset`. */
export function parseAsset(type: string, code?: string, issuer?: string): Asset {
  if (type === "native") return "XLM"
  return { code: code ?? "", issuer: issuer ?? "" }
}

/** Compare two assets for equality. */
export function assetEquals(a: Asset, b: Asset): boolean {
  if (!isIssuedAsset(a) || !isIssuedAsset(b)) return a === b
  return a.code === b.code && a.issuer === b.issuer
}

/**
 * Compute a precise decimal price string from the rational n/d.
 * Uses string arithmetic to avoid any floating-point imprecision.
 */
export function rationalToDecimal(n: string, d: string): string {
  const numerator = BigInt(n)
  const denominator = BigInt(d)
  if (denominator === 0n) return "0"

  const SCALE = 10_000_000n // 7 decimal places (Stellar's native precision)
  const scaled = (numerator * SCALE) / denominator
  const intPart = scaled / SCALE
  const fracPart = scaled % SCALE

  const fracStr = fracPart.toString().padStart(7, "0").replace(/0+$/, "")
  if (fracStr === "") return intPart.toString()
  return `${intPart}.${fracStr}`
}

/**
 * Normalize a raw Horizon TradeRecord into a NormalizedTrade.
 *
 * **Orientation rule:** when a `requestedBase` is supplied (i.e., the caller
 * asked for a specific asset pair), the result's `baseAsset` always matches
 * the requested base. If Horizon returned the record with the pair flipped,
 * base/counter are swapped and the price rational is inverted (new_n =
 * old_d, new_d = old_n) so price is always `counterAmount / baseAmount` in
 * the caller's frame of reference.
 *
 * When no `requestedBase` is supplied (account-only filter), the canonical
 * Horizon orientation is preserved.
 */
export function normalizeTrade(
  record: TradeRecord,
  accountAddress: string | null,
  requestedBase: Asset | null
): NormalizedTrade {
  const rawBase = parseAsset(
    record.base_asset_type,
    record.base_asset_code,
    record.base_asset_issuer
  )
  const rawCounter = parseAsset(
    record.counter_asset_type,
    record.counter_asset_code,
    record.counter_asset_issuer
  )

  // Default price rational from Horizon (n and d are strings in SDK 12.x).
  const rawN = record.price?.n ?? "1"
  const rawD = record.price?.d ?? "1"

  // Flip when the caller specified a baseAsset and Horizon returned it as counter.
  const shouldFlip =
    requestedBase !== null &&
    !assetEquals(rawBase, requestedBase) &&
    assetEquals(rawCounter, requestedBase)

  const baseAsset = shouldFlip ? rawCounter : rawBase
  const counterAsset = shouldFlip ? rawBase : rawCounter
  const baseAmount = shouldFlip ? record.counter_amount : record.base_amount
  const counterAmount = shouldFlip ? record.base_amount : record.counter_amount

  // Invert the price rational when flipping: if price was counter/base, it
  // becomes base/counter in the new orientation.
  const priceN = shouldFlip ? rawD : rawN
  const priceD = shouldFlip ? rawN : rawD

  const priceR = { n: Number(priceN), d: Number(priceD) }
  const price = rationalToDecimal(priceN, priceD)

  // Derive 'side' for account-filtered queries.
  // base_is_seller = true  → the base account is selling the base asset.
  // If the queried account is the base account (seller), their side is "sell".
  // If the queried account is the counter account, their side is "buy".
  let side: "buy" | "sell" | undefined
  if (accountAddress) {
    const isBaseAccount =
      "base_account" in record &&
      record.base_account !== undefined &&
      record.base_account === accountAddress

    const isCounterAccount =
      "counter_account" in record &&
      record.counter_account !== undefined &&
      record.counter_account === accountAddress

    if (isBaseAccount) {
      side = record.base_is_seller ? "sell" : "buy"
    } else if (isCounterAccount) {
      side = record.base_is_seller ? "buy" : "sell"
    }
  }

  return {
    id: record.id,
    ledgerCloseTime: record.ledger_close_time,
    tradeType: record.trade_type,
    baseAsset,
    baseAmount,
    counterAsset,
    counterAmount,
    priceR,
    price,
    baseIsSeller: record.base_is_seller,
    side,
  }
}
