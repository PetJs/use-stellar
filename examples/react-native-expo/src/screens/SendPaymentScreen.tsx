import { useState } from "react"
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native"
import { useSendPayment } from "@use-stellar/react-native"

export function SendPaymentScreen() {
  const { send, loading, error, result } = useSendPayment()
  const [to, setTo] = useState("")
  const [amount, setAmount] = useState("1")

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Send payment (testnet)</Text>
      <TextInput
        style={styles.input}
        placeholder="Destination G…"
        autoCapitalize="none"
        value={to}
        onChangeText={setTo}
      />
      <TextInput
        style={styles.input}
        placeholder="Amount"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />
      <Pressable
        style={styles.button}
        disabled={loading}
        onPress={() => {
          void send({ to, asset: "XLM", amount, memo: "expo example" })
        }}
      >
        <Text style={styles.buttonLabel}>{loading ? "Sending…" : "Send XLM"}</Text>
      </Pressable>
      {result?.status === "success" ? <Text>Hash: {result.hash}</Text> : null}
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  box: { gap: 12, padding: 16 },
  title: { fontSize: 20, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12 },
  button: { backgroundColor: "#0a7cff", padding: 12, borderRadius: 8 },
  buttonLabel: { color: "#fff", textAlign: "center" },
  error: { color: "#b00020" },
})
