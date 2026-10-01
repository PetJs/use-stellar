declare module "react-native" {
  import type { ReactNode } from "react"

  interface ViewStyle {
    [key: string]: unknown
  }

  export const View: (props: { children?: ReactNode; style?: ViewStyle }) => ReactNode
  export const Text: (props: { children?: ReactNode; style?: ViewStyle }) => ReactNode
  export const Pressable: (props: {
    children?: ReactNode
    style?: ViewStyle
    disabled?: boolean
    onPress?: () => void
  }) => ReactNode
  export const TextInput: (props: {
    style?: ViewStyle
    placeholder?: string
    autoCapitalize?: string
    keyboardType?: string
    value?: string
    onChangeText?: (value: string) => void
  }) => ReactNode
  export const ScrollView: (props: { children?: ReactNode; style?: ViewStyle }) => ReactNode
  export const SafeAreaView: (props: { children?: ReactNode; style?: ViewStyle }) => ReactNode
  export const ActivityIndicator: (props?: { style?: ViewStyle }) => ReactNode
  export const FlatList: <T>(props: {
    data: T[]
    keyExtractor: (item: T) => string
    renderItem: (info: { item: T }) => ReactNode
    onEndReached?: () => void
    onEndReachedThreshold?: number
    ListFooterComponent?: ReactNode
    ListEmptyComponent?: ReactNode
  }) => ReactNode
  export const StyleSheet: {
    create: <T extends Record<string, ViewStyle>>(styles: T) => T
  }
}

declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID?: string
  }
}
