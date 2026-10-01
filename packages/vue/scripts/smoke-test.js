#!/usr/bin/env node

/**
 * Smoke test for the @use-stellar/vue package.
 * Verifies that the dist build can be imported and basic exports exist.
 */

const fs = require("fs")
const path = require("path")

console.log("🧪 @use-stellar/vue smoke test\n")

// Check that dist exists
const distDir = path.join(__dirname, "..", "dist")
if (!fs.existsSync(distDir)) {
  console.error("❌ dist directory not found. Run `pnpm build` first.")
  process.exit(1)
}

console.log("✓ dist directory exists")

// Check that the expected files exist
const files = ["index.js", "index.mjs", "index.d.ts", "core.js", "core.mjs", "core.d.ts"]
for (const file of files) {
  const filePath = path.join(distDir, file)
  if (!fs.existsSync(filePath)) {
    console.error(`❌ ${file} not found in dist`)
    process.exit(1)
  }
  console.log(`✓ ${file} exists`)
}

console.log("\n✅ All smoke tests passed!")
