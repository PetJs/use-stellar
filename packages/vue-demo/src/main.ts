import { createApp } from "vue"
import { createStellarPlugin } from "@use-stellar/vue"
import App from "./App.vue"
import "./style.css"

createApp(App)
  .use(
    createStellarPlugin({
      networkConfig: {
        network: "testnet",
        horizonUrl: "https://horizon-testnet.stellar.org",
        sorobanUrl: "https://soroban-testnet.stellar.org",
        networkPassphrase: "Test SDF Network ; September 2015",
      },
    })
  )
  .mount("#app")
