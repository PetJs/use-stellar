# use-stellar Expo example

Runnable Expo development-build example for `@use-stellar/react-native` on the Stellar **testnet**.

It shows:

- Hermes polyfill import order
- `StellarProvider` from `@use-stellar/react-native`
- WalletConnect `projectId` from environment config (never committed)
- Deep-link scheme `use-stellar` in `app.json`
- Screens: connect wallet, balance/account, payment history (infinite scroll), send payment

## Prerequisites

- Node 20+
- A [WalletConnect Cloud](https://cloud.walletconnect.com) project id for mobile wallets
- An Expo development build (WalletConnect needs native modules; Expo Go is not enough)

## Run on testnet

From the repo root:

```bash
pnpm install
pnpm --filter use-stellar build
cp examples/react-native-expo/.env.example examples/react-native-expo/.env
# put your WalletConnect project id in EXPO_PUBLIC_WALLETCONNECT_PROJECT_ID
pnpm --filter @use-stellar/example-react-native-expo start
```

Then start a development build:

```bash
cd examples/react-native-expo
npx expo prebuild
npx expo run:android
# or
npx expo run:ios
```

The app is hard-wired to `network="testnet"`. Fund the connected account with [Friendbot](https://laboratory.stellar.org/#friendbot).

## Export / CI check

```bash
pnpm --filter @use-stellar/example-react-native-expo typecheck
# after `pnpm add expo` in this folder (or a full Expo install):
npx expo export --platform web
```

## Secrets

Do not commit `.env` or a WalletConnect project id. Only `.env.example` is tracked.
