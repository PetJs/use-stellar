import React from "react"
import mockAppState from "../test-utils/mocks/AppState"
import mockNetInfo from "../test-utils/mocks/NetInfo"
import mockAsyncStorage from "../test-utils/mocks/AsyncStorage"
import mockLinking from "../test-utils/mocks/Linking"

type NodeProps = { children?: React.ReactNode; testID?: string }

function host(name: string) {
  return function Host(props: NodeProps) {
    return React.createElement(name, props, props.children)
  }
}

export const View = host("View")
export const Text = host("Text")
export const ScrollView = host("ScrollView")
export const FlatList = host("FlatList")
export const SectionList = host("SectionList")
export const SafeAreaView = host("SafeAreaView")
export const StatusBar = host("StatusBar")

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  hairlineWidth: 1,
  flatten: (style: unknown) => style,
}

export const Platform = {
  OS: "ios" as const,
  select: <T>(spec: { ios?: T; android?: T; default?: T; native?: T }): T | undefined =>
    spec.ios ?? spec.native ?? spec.default,
}

export const Dimensions = {
  get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
  addEventListener: () => ({ remove: () => undefined }),
}

export const useWindowDimensions = () => ({ width: 390, height: 844, scale: 2, fontScale: 1 })

export const AppState = mockAppState
export const Linking = mockLinking
export const AsyncStorage = mockAsyncStorage
export const NetInfo = mockNetInfo

export default {
  View,
  Text,
  StyleSheet,
  Platform,
  AppState,
  Linking,
}
