import type { WalletNetworkId } from "../types"
import { NETWORK_PASSPHRASES } from "../types"

export const FREIGHTER_WALLET_TYPE = "freighter" as const

export { NETWORK_PASSPHRASES }

/**
 * Maps a network passphrase onto a known network.
 *
 * Driven by the shared {@link NETWORK_PASSPHRASES} table rather than a ladder
 * of string literals, so adding a network is one entry in one place.
 *
 * An unrecognised passphrase is a private or standalone network — it is
 * reported as `"custom"`, never thrown on, so a wallet pointed at a local
 * quickstart node stays usable.
 */
export function resolveNetworkFromPassphrase(passphrase: string): WalletNetworkId {
  const match = (Object.keys(NETWORK_PASSPHRASES) as (keyof typeof NETWORK_PASSPHRASES)[]).find(
    network => NETWORK_PASSPHRASES[network] === passphrase
  )

  return match ?? "custom"
}
