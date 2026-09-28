/**
 * Tests for the framework-neutral simulateContractCall service extracted from
 * useSorobanContract.
 *
 * The whole SDK is mocked so the real package is never loaded here. The mock
 * models just enough of ScVal to prove what the service does with its
 * arguments: which values it passes through, which it refuses, and which
 * account it simulates as.
 */

// ── Shared mock state ─────────────────────────────────────────────────────────
let mockSimResult: unknown = null
let mockSimError: Error | null = null
let lastSimulatedSource: string | null = null
let lastCallArgs: unknown[] = []

const mockSimulateTransaction = jest.fn()

jest.mock("@stellar/stellar-sdk", () => {
  /** A stand-in for xdr.ScVal that records the XDR type it represents. */
  class MockScVal {
    constructor(
      public readonly type: string,
      public readonly value: unknown
    ) {}

    toXDR() {
      return `${this.type}:${String(this.value)}`
    }

    switch() {
      return { name: this.type }
    }
  }

  const mockXdr = {
    ScVal: Object.assign(MockScVal, {
      scvBool: (value: boolean) => new MockScVal("scvBool", value),
      scvString: (value: string) => new MockScVal("scvString", value),
      scvSymbol: (value: string) => new MockScVal("scvSymbol", value),
      scvU32: (value: number) => new MockScVal("scvU32", value),
      scvI128: (value: bigint) => new MockScVal("scvI128", value),
      scvAddress: (value: string) => new MockScVal("scvAddress", value),
    }),
  }

  class MockContract {
    constructor(public readonly contractId: string) {}

    call(method: string, ...args: unknown[]) {
      lastCallArgs = args
      return { method, args }
    }
  }

  class MockAccount {
    constructor(
      public readonly accountId: string,
      public readonly sequence: string
    ) {}
  }

  class MockTransactionBuilder {
    private source: string

    constructor(account: MockAccount) {
      this.source = account.accountId
    }

    addOperation() {
      return this
    }

    setTimeout() {
      return this
    }

    build() {
      return { source: this.source }
    }
  }

  class MockServer {
    simulateTransaction(tx: { source: string }) {
      lastSimulatedSource = tx.source
      return mockSimulateTransaction(tx)
    }
  }

  return {
    xdr: mockXdr,
    Contract: MockContract,
    Account: MockAccount,
    TransactionBuilder: MockTransactionBuilder,
    BASE_FEE: "100",
    scValToNative: (value: { value: unknown }) => value.value,
    SorobanRpc: {
      Server: MockServer,
      Api: {
        isSimulationError: (r: unknown) =>
          typeof r === "object" && r !== null && "error" in r && !("result" in r),
        isSimulationSuccess: (r: unknown) => typeof r === "object" && r !== null && "result" in r,
      },
    },
  }
})

import { xdr } from "@stellar/stellar-sdk"
import {
  simulateContractCall,
  argsKey,
  isValidContractId,
  ANONYMOUS_SIMULATION_SOURCE,
} from "./soroban"
import type { ContractSpecLike } from "../types"

const scv = xdr.ScVal as unknown as {
  scvBool: (value: boolean) => unknown
  scvString: (value: string) => unknown
  scvSymbol: (value: string) => unknown
  scvU32: (value: number) => unknown
  scvI128: (value: bigint) => unknown
  scvAddress: (value: string) => unknown
}

const VALID_CONTRACT_ID = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM"
const TEST_ADDRESS = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"

const networkConfig = {
  sorobanUrl: "https://soroban-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
}

beforeEach(() => {
  mockSimResult = null
  mockSimError = null
  lastSimulatedSource = null
  lastCallArgs = []
  mockSimulateTransaction.mockImplementation(async () => {
    if (mockSimError) throw mockSimError
    return mockSimResult
  })
})

function succeedWith(value: unknown) {
  mockSimResult = { result: { retval: scv.scvBool(value as boolean) }, cost: {}, latestLedger: 1 }
}

describe("simulateContractCall — success", () => {
  it("returns decoded data on successful simulation", async () => {
    succeedWith(true)

    const data = await simulateContractCall(networkConfig, {
      contractId: VALID_CONTRACT_ID,
      method: "get_value",
    })

    expect(data).toBe(true)
  })

  it("returns null when simulation returns no retval", async () => {
    mockSimResult = { result: { retval: undefined }, cost: {}, latestLedger: 1 }

    const data = await simulateContractCall(networkConfig, {
      contractId: VALID_CONTRACT_ID,
      method: "noop",
    })

    expect(data).toBeNull()
  })
})

describe("simulateContractCall — contract-ID validation", () => {
  it("throws for an invalid contract ID", async () => {
    await expect(
      simulateContractCall(networkConfig, { contractId: "INVALID_ID", method: "balance" })
    ).rejects.toThrow(/Invalid contract ID/)
  })

  it("does not call the RPC when the contract ID is invalid", async () => {
    await expect(
      simulateContractCall(networkConfig, { contractId: "INVALID_ID", method: "balance" })
    ).rejects.toThrow()

    expect(mockSimulateTransaction).not.toHaveBeenCalled()
  })
})

describe("simulateContractCall — argument serialization", () => {
  it("passes an Address ScVal through untouched", async () => {
    succeedWith(true)
    const address = scv.scvAddress(TEST_ADDRESS)

    await simulateContractCall(networkConfig, {
      contractId: VALID_CONTRACT_ID,
      method: "call",
      args: [address],
    })

    expect(lastCallArgs[0]).toBe(address)
  })

  it("refuses an ambiguous bare string", async () => {
    await expect(
      simulateContractCall(networkConfig, {
        contractId: VALID_CONTRACT_ID,
        method: "call",
        args: ["transfer"],
      })
    ).rejects.toThrow(/Symbol, String, or Address/)
  })

  it("refuses an ambiguous bare number", async () => {
    await expect(
      simulateContractCall(networkConfig, {
        contractId: VALID_CONTRACT_ID,
        method: "call",
        args: [42],
      })
    ).rejects.toThrow(/u32, i32, u64, i64, u128, or i128/)
  })

  it("refuses a number beyond MAX_SAFE_INTEGER", async () => {
    await expect(
      simulateContractCall(networkConfig, {
        contractId: VALID_CONTRACT_ID,
        method: "call",
        args: [Number.MAX_SAFE_INTEGER + 2],
      })
    ).rejects.toThrow(/MAX_SAFE_INTEGER/)
  })

  it("refuses a bare bigint with unstated width", async () => {
    await expect(
      simulateContractCall(networkConfig, {
        contractId: VALID_CONTRACT_ID,
        method: "call",
        args: [BigInt(1)],
      })
    ).rejects.toThrow(/u64, i64, u128, or i128/)
  })

  it("converts a boolean without complaint", async () => {
    succeedWith(true)
    await expect(
      simulateContractCall(networkConfig, {
        contractId: VALID_CONTRACT_ID,
        method: "call",
        args: [true],
      })
    ).resolves.not.toThrow()
  })
})

describe("simulateContractCall — spec-aware conversion", () => {
  function buildBalanceSpec(): ContractSpecLike {
    return {
      getFunc: (name: string) => {
        if (name !== "balance") throw new Error(`no such function ${name}`)
        return { inputs: () => [{ name: () => "id" }] }
      },
      funcArgsToScVals: (_name: string, args: object) => {
        const named = args as { id: unknown }
        return [scv.scvAddress(String(named.id))]
      },
      funcResToNative: (_name: string, value: { value: unknown }) => value.value,
    }
  }

  it("converts arguments against the contract's declared parameter types", async () => {
    mockSimResult = { result: { retval: scv.scvI128(BigInt(42)) }, cost: {}, latestLedger: 1 }

    const data = await simulateContractCall<bigint>(networkConfig, {
      contractId: VALID_CONTRACT_ID,
      method: "balance",
      args: [TEST_ADDRESS],
      spec: buildBalanceSpec(),
    })

    expect(data).toBe(BigInt(42))
    expect((lastCallArgs[0] as { type: string }).type).toBe("scvAddress")
  })

  it("reports an argument-count mismatch instead of calling the contract", async () => {
    await expect(
      simulateContractCall(networkConfig, {
        contractId: VALID_CONTRACT_ID,
        method: "balance",
        args: [],
        spec: buildBalanceSpec(),
      })
    ).rejects.toThrow(/expects 1 argument\(s\), received 0/)
  })
})

describe("simulateContractCall — simulation source", () => {
  it("simulates as the explicit sourceAccount when given", async () => {
    succeedWith(true)

    await simulateContractCall(networkConfig, {
      contractId: VALID_CONTRACT_ID,
      method: "balance",
      sourceAccount: TEST_ADDRESS,
    })

    expect(lastSimulatedSource).toBe(TEST_ADDRESS)
  })

  it("falls back to the documented anonymous placeholder when no sourceAccount is given", async () => {
    succeedWith(true)

    await simulateContractCall(networkConfig, {
      contractId: VALID_CONTRACT_ID,
      method: "balance",
    })

    expect(lastSimulatedSource).toBe(ANONYMOUS_SIMULATION_SOURCE)
  })
})

describe("simulateContractCall — RPC errors", () => {
  it("throws SIMULATION_FAILED on an RPC simulation error response", async () => {
    mockSimResult = { error: "contract not found" }

    await expect(
      simulateContractCall(networkConfig, { contractId: VALID_CONTRACT_ID, method: "balance" })
    ).rejects.toMatchObject({ code: "SIMULATION_FAILED" })
  })

  it("propagates a network error thrown by the RPC", async () => {
    mockSimError = new Error("Network error")

    await expect(
      simulateContractCall(networkConfig, { contractId: VALID_CONTRACT_ID, method: "balance" })
    ).rejects.toThrow("Network error")
  })
})

describe("argsKey", () => {
  it("produces the same key format used to derive the cache key", () => {
    const address = scv.scvAddress(TEST_ADDRESS) as InstanceType<typeof xdr.ScVal>
    expect(argsKey([address])).toBe(address.toXDR("base64"))
  })

  it("stabilizes equivalent ScVal arguments across separate constructions", () => {
    const a = scv.scvBool(true) as InstanceType<typeof xdr.ScVal>
    const b = scv.scvBool(true) as InstanceType<typeof xdr.ScVal>
    expect(argsKey([a])).toBe(argsKey([b]))
  })

  it("serializes bigint arguments with a trailing n", () => {
    expect(argsKey([BigInt(42)])).toBe("42n")
  })
})

describe("isValidContractId", () => {
  it("accepts a well-formed contract id", () => {
    expect(isValidContractId(VALID_CONTRACT_ID)).toBe(true)
  })

  it("rejects a malformed id", () => {
    expect(isValidContractId("INVALID_ID")).toBe(false)
  })
})
