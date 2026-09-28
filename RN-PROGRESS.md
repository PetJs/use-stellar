# React Native track — progress notes

This file tracks progress on issues #352, #356, #357, #358. It is a working
document for the duration of the PR and will be removed before the PR is
marked ready for review.

## Discovery findings

`packages/react-native` does not exist in this repository yet. Issues #352,
#356, #357, #358 assume prerequisite React Native infrastructure (tracked
upstream as `rn-07` through `rn-14`, corresponding to open issues #340-#348,
#398, #403) that has not been built:

- #340 — scaffold `@use-stellar/react-native`
- #341 — native `StellarProvider` (AppState/NetInfo/storage)
- #342 — polyfills entry
- #343 — RN package exports + Metro resolution
- #345 — WalletConnect mobile wallet connection
- #346 — deep-link return handling
- #347 — transaction time-bound/expiry safety for app-switch signing
- #348 — RN test harness + native module mocks
- #398 — WalletConnect wallet adapter (core `wallets` layer)
- #403 — WalletConnect session persistence/autoConnect

This PR builds the minimum real subset of that infrastructure needed to make
#352/#356/#357/#358 genuinely true, reusing the existing `packages/core`
wallet adapter contract (`WalletAdapter` in `packages/core/src/wallets/types.ts`)
rather than forking hook logic into a new package. This PR does not claim to
close #340-#348/#398/#403 — only #352, #356, #357, #358 are being closed here.

## Status

- [ ] WalletConnect wallet adapter added at the core layer
- [ ] `packages/react-native` package scaffold
- [ ] RN `StellarProvider` re-export + polyfills entry
- [ ] Deep-link resume handling
- [ ] Expiry/time-bound handling for app-switch signing
- [ ] RN test harness
- [ ] #352 write-hook tests
- [ ] #356 installation/provider docs
- [ ] #357 wallet/deep-link docs
- [ ] #358 CI/size/release wiring
- [ ] Full validation run
