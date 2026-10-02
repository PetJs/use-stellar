import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/core.ts"],
  entry: ["src/index.ts", "src/index.react-native.ts"],
  entry: ["src/index.ts", "src/index.react-native.ts", "src/core.ts"],
  format: ["cjs", "esm"],
  target: "es2020",
  dts: true,
  // Pinned to the same floor as tsconfig's `target` and the package's
  // `engines.node`, so typecheck and build agree on what this package supports
  // instead of esbuild silently emitting whatever syntax the source happened to
  // use.
  // `src` is published (see `files` in package.json), so these maps resolve to
  // real files in an installed copy. A map that points at sources the consumer
  // does not have is worse than shipping no map at all.
  sourcemap: true,
  clean: true,
  treeshake: true,
  banner: { js: '"use client";' },
  external: [
    "react",
    "react-dom",
    "@stellar/stellar-sdk",
    "@albedo-link/intent",
    "@stellar/freighter-api",
  ],
})
