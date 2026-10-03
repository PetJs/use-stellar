// Stellar React Native SDK - Main entry point
// Re-exports all public APIs from use-stellar for React Native apps.
// NOTE: Does NOT import polyfills. Apps must explicitly import:
//   import '@use-stellar/react-native/polyfills'

/**
 * @use-stellar/react-native
 *
 * React Native StellarProvider with native platform integrations for AppState,
 * NetInfo, and AsyncStorage. Re-exports all core hooks and types.
 */

// Provider
export { StellarProvider } from "./StellarProvider"
export type { NativeStellarProviderProps } from "./StellarProvider"

// Platform integrations
export { createAppStateFocusManager, createAlwaysFocusedManager } from "./platform/appStateFocus"
export type { FocusManager } from "./platform/appStateFocus"

export { createNetInfoOnlineManager, createAlwaysOnlineManager } from "./platform/netInfoOnline"
export type { OnlineManager } from "./platform/netInfoOnline"

export { createAsyncStorageAdapter, createInMemoryStorage } from "./platform/asyncStorageSession"
export type { Storage } from "./platform/asyncStorageSession"

// Re-export all core hooks and types
export {
  // Provider
  useStellarContext,
  WALLET_SESSION_STORAGE_KEY,
  // Hooks
  useWallet,
  useBalance,
  useAccount,
  useAccountExists,
  useSendPayment,
  useAddTrustline,
  useTransaction,
  useNetwork,
  useAsset,
  useFederationLookup,
  useSorobanContract,
  useSorobanWrite,
  usePaymentPaths,
  useContractEvents,
  usePathPayment,
  usePayments,
  useTransactionHistory,
  usePaymentHistory,
  useClaimableBalance,
  useFeeStats,
  useAnchor,
  useTrades,
  useOffers,
  useManageOffer,
  useCreateAccount,
  useOrderbook,
  useSep10Auth,
  // Utilities
  registerWalletAdapter,
  getWalletAdapter,
  getWalletAdapters,
  hasWalletAdapter,
  isBrowser,
  isValidAssetCode,
  isValidStellarAddress,
  shortenAddress,
  formatAmount,
  formatAssetCode,
  DEFAULT_FEE_MULTIPLIER,
  NETWORK_CONFIGS,
  getNetworkPassphrase,
  resolveNetworkConfig,
  // Errors
  StellarError,
  createStellarError,
  toStellarError,
  isStellarError,
  isStellarErrorCode,
  isAbortError,
  STELLAR_ERROR_CODES,
  DEFAULT_ERROR_MESSAGES,
  WalletAdapterError,
  // Wallets
  FREIGHTER_WALLET_TYPE,
  NETWORK_PASSPHRASES,
  freighterAdapter,
  resolveNetworkFromPassphrase,
  ANONYMOUS_SIMULATION_SOURCE,
} from "use-stellar"

export type {
  // Types
  StellarNetwork,
  NetworkConfig,
  CustomNetworkConfig,
  StellarContextValue,
  WalletState,
  AutoConnectOptions,
  QueryConfig,
  Asset,
  NativeAsset,
  IssuedAsset,
  Balance,
  AccountInfo,
  TransactionResult,
  TransactionStatus,
  SendPaymentOptions,
  SendPaymentResult,
  UseAddTrustlineReturn,
  AddTrustlineOptions,
  NormalizedPayment,
  ContractCallOptions,
  ContractSpecLike,
  ContractEvent,
  FeeOptions,
  FeeUrgency,
  PaymentPath,
  PathPaymentOptions,
  NormalizedTransaction,
  ClaimableBalance,
  ClaimableBalanceClaimant,
  AccountExistsReason,
  NormalizedTrade,
  NormalizedOffer,
  CreateOfferOptions,
  UpdateOfferOptions,
  OrderbookEntry,
  // Wallet types
  WalletType,
  WalletNetworkId,
  RegisterWalletAdapterOptions,
  SignTransactionOptions,
  WalletAdapter,
  WalletAdapterErrorCode,
  WalletAdapterMetadata,
  WalletChange,
  WalletConnection,
  WalletNetworkDetails,
  WalletNetworkState,
  // Error types
  StellarErrorCode,
  StellarErrorOptions,
  // Hook return types
  UseWalletReturn,
  UseBalanceOptions,
  UseBalanceReturn,
  UseAccountOptions,
  UseAccountReturn,
  UseSendPaymentReturn,
  UseTransactionOptions,
  UseTransactionReturn,
  UseNetworkReturn,
  AssetInfo,
  UseAssetOptions,
  UseAssetReturn,
  FederationRecord,
  UseFederationLookupOptions,
  UseFederationLookupReturn,
  UseSorobanContractReturn,
  SorobanInvokeOptions,
  UseSorobanWriteReturn,
  UseClaimableBalanceOptions,
  UseClaimableBalanceReturn,
  AnchorInfo,
  AnchorCurrency,
  UseAnchorOptions,
  UseAnchorReturn,
  UseSep10AuthOptions,
  UseSep10AuthReturn,
  UseContractEventsOptions,
  UseContractEventsReturn,
  UsePaymentPathsOptions,
  UsePaymentPathsReturn,
  UsePathPaymentReturn,
  UsePaymentsOptions,
  UsePaymentsReturn,
  UseTransactionHistoryOptions,
  UseTransactionHistoryReturn,
  UsePaymentHistoryOptions,
  UsePaymentHistoryReturn,
  UseFeeStatsOptions,
  UseFeeStatsReturn,
  UseTradesOptions,
  UseTradesReturn,
  UseOffersOptions,
  UseOffersReturn,
  UseManageOfferReturn,
  CreateAccountOptions,
  UseCreateAccountReturn,
  UseOrderbookOptions,
  UseOrderbookReturn,
  UseAccountExistsOptions,
  UseAccountExistsReturn,
} from "use-stellar"
