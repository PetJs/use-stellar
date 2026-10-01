import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/core.ts"],
  format: ["cjs", "esm"],
  target: "es2020",
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  banner: { js: '"use client";' },
  external: ["vue", "use-stellar"],
})
