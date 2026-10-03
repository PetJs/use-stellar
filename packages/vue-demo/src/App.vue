<script setup lang="ts">
import { computed, ref, watch } from "vue"
import {
  useAccount,
  useNetwork,
  useSendPayment,
  useSorobanContract,
  useTransactionHistory,
  useWallet,
} from "@use-stellar/vue"

const wallet = useWallet()
const { network } = useNetwork()
const customAddress = ref("")
const address = computed(() => customAddress.value.trim() || wallet.address.value)
const account = useAccount({ address })
const history = useTransactionHistory({ address, limit: 5, order: "desc" })

const contractId = ref("")
const method = ref("")
const selectedContract = ref("")
const selectedMethod = ref("")
const contract = useSorobanContract({ contractId: selectedContract, method: selectedMethod })

const destination = ref("")
const amount = ref("")
const memo = ref("")
const payment = useSendPayment()
const sendError = ref("")

const canSign = computed(
  () => wallet.connected.value && !wallet.isNetworkMismatch.value && network.value === "testnet"
)
const xlmBalance = computed(
  () => account.account.value?.balances.find(balance => balance.asset === "XLM")?.balance
)

watch(address, () => {
  account.refetch()
  history.refetch()
})

function readContract() {
  selectedContract.value = contractId.value.trim()
  selectedMethod.value = method.value.trim()
  contract.refetch()
}

async function sendPayment() {
  if (!canSign.value) return
  sendError.value = ""
  try {
    const result = await payment.send({
      to: destination.value.trim(),
      asset: "XLM",
      amount: amount.value.trim(),
      ...(memo.value.trim() ? { memo: memo.value.trim() } : {}),
    })
    if (result.status === "success") {
      account.refetch()
      history.refetch()
    }
  } catch (error) {
    sendError.value = error instanceof Error ? error.message : String(error)
  }
}

function display(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item
  ) ?? "null"
}
</script>

<template>
  <main>
    <header>
      <div>
        <h1>use-stellar · Vue demo</h1>
        <p>Explore wallet and account flows on Stellar testnet.</p>
      </div>
      <span class="badge">{{ network }}</span>
    </header>

    <section aria-labelledby="wallet-heading">
      <h2 id="wallet-heading">Wallet</h2>
      <p>Connect and disconnect a Stellar wallet. Use Freighter on testnet to try transactions.</p>
      <p v-if="wallet.connected.value">Connected: <code>{{ wallet.address.value }}</code></p>
      <p v-else>No wallet connected.</p>
      <p v-if="wallet.isNetworkMismatch.value" class="error">
        Wallet is on {{ wallet.walletNetwork.value ?? "an unknown network" }}. Switch it to testnet before sending.
      </p>
      <p v-if="wallet.error.value" class="error">{{ wallet.error.value.message }}</p>
      <div class="actions">
        <button v-if="!wallet.connected.value" :disabled="wallet.connecting.value" @click="wallet.connect('freighter')">
          {{ wallet.connecting.value ? "Connecting…" : "Connect Freighter" }}
        </button>
        <template v-else>
          <button @click="wallet.refreshWalletNetwork()">Refresh wallet network</button>
          <button @click="wallet.disconnect()">Disconnect</button>
        </template>
      </div>
    </section>

    <section aria-labelledby="account-heading">
      <h2 id="account-heading">Balance and account</h2>
      <p>Connect a wallet or enter a testnet public address to view its account.</p>
      <label>Public address <input v-model="customAddress" placeholder="G…" autocomplete="off" /></label>
      <p v-if="account.loading.value">Loading account…</p>
      <p v-if="account.error.value" class="error">{{ account.error.value.message }}</p>
      <template v-if="account.account.value">
        <p>XLM balance: <strong>{{ xlmBalance ?? "0" }}</strong></p>
        <p>Sequence: <code>{{ account.account.value.sequence }}</code></p>
        <p>Balances: {{ account.account.value.balances.length }}</p>
      </template>
      <button :disabled="!address" @click="account.refetch()">Refresh account</button>
    </section>

    <section aria-labelledby="history-heading">
      <h2 id="history-heading">Transaction history</h2>
      <p>Recent transactions for the address above, five per page.</p>
      <p v-if="history.loading.value">Loading transactions…</p>
      <p v-if="history.error.value" class="error">{{ history.error.value.message }}</p>
      <p v-if="address && !history.loading.value && !history.transactions.value.length">No transactions found.</p>
      <ul v-if="history.transactions.value.length">
        <li v-for="transaction in history.transactions.value" :key="transaction.hash">
          <a :href="`https://stellar.expert/explorer/testnet/tx/${transaction.hash}`" target="_blank" rel="noopener noreferrer">
            {{ transaction.hash.slice(0, 12) }}…
          </a>
          · {{ transaction.successful ? "Success" : "Failed" }}
          · {{ transaction.createdAt }}
        </li>
      </ul>
      <div class="actions">
        <button :disabled="history.loading.value || !history.hasPrev.value" @click="history.fetchPrev()">Previous</button>
        <button :disabled="history.loading.value || !history.hasNext.value" @click="history.fetchNext()">Next</button>
      </div>
    </section>

    <section aria-labelledby="contract-heading">
      <h2 id="contract-heading">Soroban read</h2>
      <p>Simulate a read-only contract method on testnet. Start with a method that takes no arguments.</p>
      <form @submit.prevent="readContract">
        <label>Contract ID <input v-model="contractId" placeholder="C…" required pattern="C[A-Z2-7]{55}" /></label>
        <label>Method <input v-model="method" placeholder="get_value" required /></label>
        <button :disabled="contract.loading.value">{{ contract.loading.value ? "Reading…" : "Read contract" }}</button>
      </form>
      <p v-if="contract.error.value" class="error">{{ contract.error.value.message }}</p>
      <pre v-if="contract.data.value !== null">{{ display(contract.data.value) }}</pre>
    </section>

    <section aria-labelledby="payment-heading">
      <h2 id="payment-heading">Send payment</h2>
      <p>Send XLM from your connected wallet on testnet. Review the request in your wallet before signing.</p>
      <form @submit.prevent="sendPayment">
        <label>Destination <input v-model="destination" placeholder="G…" required pattern="G[A-Z2-7]{55}" /></label>
        <label>Amount in XLM <input v-model="amount" type="number" min="0.0000001" step="0.0000001" required /></label>
        <label>Memo (optional) <input v-model="memo" maxlength="28" /></label>
        <button :disabled="!canSign || payment.loading.value">
          {{ payment.loading.value ? "Sending…" : "Send XLM" }}
        </button>
      </form>
      <p v-if="!canSign">Connect a wallet on testnet to send.</p>
      <p v-if="payment.error.value" class="error">{{ payment.error.value.message }}</p>
      <p v-if="sendError" class="error">{{ sendError }}</p>
      <p v-if="payment.result.value?.status === 'success'">
        Sent: <a :href="`https://stellar.expert/explorer/testnet/tx/${payment.result.value.hash}`" target="_blank" rel="noopener noreferrer">{{ payment.result.value.hash }}</a>
      </p>
    </section>
  </main>
</template>
