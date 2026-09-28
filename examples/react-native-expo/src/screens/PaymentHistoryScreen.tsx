import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native"
import { usePayments } from "@use-stellar/react-native"

export function PaymentHistoryScreen() {
  const { payments, loading, error, hasNext, fetchNext } = usePayments({ limit: 20 })

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Payment history</Text>
      {error ? <Text style={styles.error}>{error.message}</Text> : null}
      <FlatList
        data={payments}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <Text style={styles.row}>
            {item.amount} {typeof item.asset === "string" ? item.asset : item.asset.code}
          </Text>
        )}
        onEndReached={() => {
          if (hasNext) void fetchNext()
        }}
        onEndReachedThreshold={0.4}
        ListFooterComponent={loading ? <ActivityIndicator /> : null}
        ListEmptyComponent={!loading ? <Text>No payments on testnet yet.</Text> : null}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  box: { flex: 1, padding: 16 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 12 },
  row: { paddingVertical: 8 },
  error: { color: "#b00020" },
})
