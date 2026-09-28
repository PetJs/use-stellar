import { Asset as StellarAsset } from "@stellar/stellar-sdk"
import { getHorizonServer, isNativeAsset, isIssuedAsset } from "../utils"
import { createStellarError, toStellarError } from "../errors"
import type { Asset, NetworkConfig, PaymentPath, UsePaymentPathsOptions } from "../types"

const RATE_SCALE = 7
const STROOP_DECIMALS = 7

function toStroops(amount: string): bigint {
  const trimmed = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error(`Invalid amount "${amount}". Expected a positive decimal string.`)
  }
  const [whole, fraction = ""] = trimmed.split(".")
  const padded = (fraction + "0".repeat(STROOP_DECIMALS)).slice(0, STROOP_DECIMALS)
  return BigInt(whole) * BigInt(10) ** BigInt(STROOP_DECIMALS) + BigInt(padded)
}

function divideToDecimalString(numerator: bigint, denominator: bigint): string {
  if (denominator === BigInt(0)) return "0"
  const scale = BigInt(10) ** BigInt(RATE_SCALE)
  const scaled = (numerator * scale) / denominator
  const whole = scaled / scale
  const fraction = (scaled % scale).toString().padStart(RATE_SCALE, "0").replace(/0+$/, "")
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

function compareRates(a: string, b: string): number {
  const [aWhole, aFraction = ""] = a.split(".")
  const [bWhole, bFraction = ""] = b.split(".")
  const width = Math.max(aFraction.length, bFraction.length)
  const left = BigInt(aWhole + aFraction.padEnd(width, "0"))
  const right = BigInt(bWhole + bFraction.padEnd(width, "0"))
  if (left === right) return 0
  return left > right ? 1 : -1
}

function toStellarAsset(asset: Asset): StellarAsset {
  if (isNativeAsset(asset)) return StellarAsset.native()
  if (isIssuedAsset(asset)) return new StellarAsset(asset.code, asset.issuer)
  throw createStellarError(
    "VALIDATION_ERROR",
    `Unsupported asset ${JSON.stringify(asset)}. Pass "XLM" or { code, issuer }.`
  )
}

interface HorizonPathRecord {
  source_amount: string
  destination_amount: string
  path: { asset_type: string; asset_code?: string; asset_issuer?: string }[]
}

function toAsset(hop: HorizonPathRecord["path"][number]): Asset {
  if (hop.asset_type === "native") return "XLM"
  return { code: hop.asset_code ?? "", issuer: hop.asset_issuer ?? "" }
}

function toPaymentPath(record: HorizonPathRecord): PaymentPath {
  return {
    path: record.path.map(toAsset),
    sourceAmount: record.source_amount,
    destinationAmount: record.destination_amount,
    rate: divideToDecimalString(
      toStroops(record.destination_amount),
      toStroops(record.source_amount)
    ),
  }
}

/** Converts a use-stellar `Asset` to a stable string key for cache keys. */
export function assetKeyStr(asset: Asset): string {
  if (isNativeAsset(asset)) return "native"
  if (isIssuedAsset(asset)) return `${asset.code}:${asset.issuer}`
  return String(asset)
}

export interface PaymentPathsResult {
  paths: PaymentPath[]
  lastUpdated: Date
}

/**
 * Finds the routes and quotes for converting one asset into another via
 * Horizon's strict-send / strict-receive path-finding endpoints.
 *
 * Framework-neutral: no React/Vue imports, no cache access. Errors are
 * mapped through `toStellarError` so both frameworks surface identical
 * codes. The discriminated `mode` union and its validation are preserved
 * exactly as the original React hook enforced them.
 */
export async function fetchPaymentPaths(
  networkConfig: NetworkConfig,
  options: UsePaymentPathsOptions,
  { signal }: { signal?: AbortSignal } = {}
): Promise<PaymentPathsResult> {
  const { mode, sourceAsset, destinationAsset } = options
  const sourceAmount = mode === "strictSend" ? options.sourceAmount : undefined
  const destinationAmount = mode === "strictReceive" ? options.destinationAmount : undefined
  const destinationAddress = mode === "strictSend" ? options.destinationAddress : undefined
  const sourceAddress = mode === "strictReceive" ? options.sourceAddress : undefined

  try {
    if (mode === "strictSend" && !sourceAmount) {
      throw createStellarError(
        "VALIDATION_ERROR",
        'usePaymentPaths: "strictSend" mode requires `sourceAmount`.'
      )
    }
    if (mode === "strictReceive" && !destinationAmount) {
      throw createStellarError(
        "VALIDATION_ERROR",
        'usePaymentPaths: "strictReceive" mode requires `destinationAmount`.'
      )
    }

    const server = getHorizonServer(networkConfig)
    const source = toStellarAsset(sourceAsset)
    const destination = toStellarAsset(destinationAsset)

    const builder =
      mode === "strictSend"
        ? server.strictSendPaths(
            source,
            sourceAmount as string,
            destinationAddress ?? [destination]
          )
        : server.strictReceivePaths(
            sourceAddress ?? [source],
            destination,
            destinationAmount as string
          )

    const response = await builder.call()
    const records = (response.records ?? []) as unknown as HorizonPathRecord[]
    const converted = records.map(toPaymentPath).sort((a, b) => compareRates(b.rate, a.rate))

    return { paths: converted, lastUpdated: new Date() }
  } catch (err) {
    if (signal?.aborted) throw err
    const stellarError = toStellarError(err)
    throw stellarError ?? err
  }
}
