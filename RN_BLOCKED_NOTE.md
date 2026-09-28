# Issue #351 — blocked, not included in this PR

`packages/react-native` does not exist on `dev`. It currently only exists on the
unmerged PR #406 (`merge/rn-features-integration`), which is failing CI (Build SDK,
Code quality, and Unit tests all fail).

Issue #351 requires adding RN pagination test files and updating
`packages/react-native/src/index.ts`, which is impossible against `dev` as it
stands today. Fabricating a throwaway RN package skeleton to satisfy the issue
would be out of scope for a "verification tests" issue and would not reflect the
real, intended RN package.

Recommend revisiting #351 once #406 merges (or its CI failures are fixed and it
lands separately), then writing the pagination/FlatList verification tests
against the real RN package and its actual `StellarProvider`/hook implementations.

This PR does not close #351.
