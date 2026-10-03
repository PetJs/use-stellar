import { registerWalletAdapter } from "./src/wallets/registry"
import { freighterAdapter } from "./src/wallets/freighterAdapter"
import { albedoAdapter } from "./src/wallets/albedoAdapter"

registerWalletAdapter(freighterAdapter)
registerWalletAdapter(albedoAdapter)
