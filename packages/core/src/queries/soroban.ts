import {
  SorobanRpc,
  Contract,
  xdr,
  scValToNative,
  TransactionBuilder,
  BASE_FEE,
  Account,
} from "@stellar/stellar-sdk"
import { createStellarError } from "../errors"
import type { ContractCallOptions, ContractSpecLike, NetworkConfig } from "../types"

/**
 * The account simulations run as when no wallet is connected.
 */
export const ANONYMOUS_SIMULATION_SOURCE =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

/** Options for {@link simulateContractCall}, beyond the network configuration. */
export interface SimulateContractCallOptions extends ContractCallOptions {
  /**
   * Account to simulate as. Defaults to {@link ANONYMOUS_SIMULATION_SOURCE}
   * when omitted — callers that want "as the connected wallet" pass
   * `wallet.address` explicitly.
   */
  sourceAccount?: string
}

function toScVal(arg: unknown, index: number): xdr.ScVal {
  if (arg instanceof xdr.ScVal) return arg
  if (typeof arg === "boolean") return xdr.ScVal.scvBool(arg)
  if (typeof arg === "string") {
    throw new Error(
      `Argument ${index} is a string, which could be Symbol, String, or Address. ` +
        "Pass an xdr.ScVal so the type is explicit."
    )
  }
  if (typeof arg === "number") {
    // A number past the safe range has already lost precision before it reached
    // us, so the width is not the only problem — say so, rather than implying a
    // cast would fix it.
    if (!Number.isSafeInteger(arg)) {
      throw new Error(
        `Argument ${index} is a number outside Number.MAX_SAFE_INTEGER and cannot be ` +
          "converted without losing precision. Pass a bigint wrapped in the explicit " +
          "xdr.ScVal width you mean (for example xdr.ScVal.scvI128)."
      )
    }
    throw new Error(
      `Argument ${index} is a number, which could be u32, i32, u64, i64, u128, or i128. ` +
        "Pass an xdr.ScVal so the type is explicit."
    )
  }
  if (typeof arg === "bigint") {
    throw new Error(
      `Argument ${index} is a bigint, which could be u64, i64, u128, or i128. ` +
        "Pass an xdr.ScVal so the width is explicit."
    )
  }
  throw new Error(
    `Argument ${index} has unsupported type ${typeof arg}. Pass an xdr.ScVal directly.`
  )
}

/** Renders an argument as it will appear in a query key — see {@link argsKey}. */
function describeArg(arg: unknown): string {
  if (arg instanceof xdr.ScVal) return arg.toXDR("base64")
  if (typeof arg === "bigint") return `${arg}n`
  try {
    return JSON.stringify(arg) ?? String(arg)
  } catch {
    return String(arg)
  }
}

/**
 * Serialises call arguments into the string used as part of the cache key
 * (`sorobanContractKey`'s `argsKey` segment). Exported so adapters build keys
 * identically to how `simulateContractCall` interprets them.
 */
export function argsKey(args: readonly unknown[]): string {
  return args.map(describeArg).join("|")
}

/** Validates a contract ID is a C-prefixed 56-character Stellar address. */
export function isValidContractId(id: string): boolean {
  return typeof id === "string" && /^C[A-Z2-7]{55}$/.test(id)
}

function buildSpecArgs(
  spec: ContractSpecLike,
  method: string,
  args: readonly unknown[]
): Record<string, unknown> {
  const params = spec.getFunc(method).inputs() as { name: () => { toString: () => string } }[]
  if (args.length !== params.length) {
    throw new Error(
      `Contract method "${method}" expects ${params.length} argument(s), received ${args.length}.`
    )
  }
  const named: Record<string, unknown> = {}
  params.forEach((param, index) => {
    named[param.name().toString()] = args[index]
  })
  return named
}

/**
 * Simulates a Soroban contract call against the RPC server and returns the
 * decoded result.
 *
 * Framework-neutral extraction of `useSorobanContract`'s query function.
 * Preserves, verbatim: contract-ID validation, the `ANONYMOUS_SIMULATION_SOURCE`
 * fallback, `ContractSpecLike` argument mapping, result decoding, and RPC error
 * behaviour.
 *
 * @throws {Error} When the contract ID is invalid or argument conversion fails.
 * @throws {StellarError} `SIMULATION_FAILED` when the RPC reports a simulation
 *         error or an unsuccessful result.
 */
export async function simulateContractCall<T = unknown>(
  networkConfig: Pick<NetworkConfig, "sorobanUrl" | "networkPassphrase">,
  options: SimulateContractCallOptions
): Promise<T> {
  const { contractId, method, args = [], spec, sourceAccount } = options
  const { sorobanUrl, networkPassphrase } = networkConfig
  const source = sourceAccount ?? ANONYMOUS_SIMULATION_SOURCE

  if (!isValidContractId(contractId)) {
    throw new Error(
      `Invalid contract ID "${contractId}". Must be a C-prefixed 56-character Stellar address.`
    )
  }

  const server = new SorobanRpc.Server(sorobanUrl, {
    allowHttp: sorobanUrl.startsWith("http://"),
  })

  let scArgs: xdr.ScVal[]
  try {
    scArgs = spec
      ? (spec.funcArgsToScVals(method, buildSpecArgs(spec, method, args)) as xdr.ScVal[])
      : args.map(toScVal)
  } catch (argErr) {
    throw new Error(
      `Argument conversion failed: ${argErr instanceof Error ? argErr.message : String(argErr)}`
    )
  }

  const contract = new Contract(contractId)
  const operation = contract.call(method, ...scArgs)
  const simulationSource = new Account(source, "0")

  const tx = new TransactionBuilder(simulationSource, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build()

  const simResult = await server.simulateTransaction(tx)

  if (SorobanRpc.Api.isSimulationError(simResult)) {
    throw createStellarError("SIMULATION_FAILED", `RPC simulation error: ${simResult.error}`)
  }
  if (!SorobanRpc.Api.isSimulationSuccess(simResult)) {
    throw createStellarError("SIMULATION_FAILED", "Simulation did not return a successful result.")
  }

  const returnVal = simResult.result?.retval
  if (!returnVal) return null as unknown as T

  try {
    return (spec ? spec.funcResToNative(method, returnVal) : scValToNative(returnVal)) as T
  } catch {
    return { raw: returnVal.toXDR("base64") } as T
  }
}
