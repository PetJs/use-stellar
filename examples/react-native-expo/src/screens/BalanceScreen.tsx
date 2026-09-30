import { StyleSheet, Text, View } from "react-native"
import { useAccount, useBalance } from "@use-stellar/react-native"

export function BalanceScreen() {
  const {
    balance,
    loading: balanceLoading,
    error: balanceError,
  } = useBalance({
    asset: "XLM",
    watch: true,
  })
  const { account, loading: accountLoading, error: accountError } = useAccount()

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Balance and account</Text>
      {balanceLoading || accountLoading ? <Text>Loading…</Text> : null}
      <Text>XLM: {balance ?? "0"}</Text>
      <Text>Account: {account?.address ?? "not connected"}</Text>
      <Text>Sequence: {account?.sequence ?? "—"}</Text>
      {balanceError ? <Text style={styles.error}>{balanceError.message}</Text> : null}
      {accountError ? <Text style={styles.error}>{accountError.message}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  error: { color: "#b00020" },
})
