const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const METRO_APP_DIR = path.resolve(__dirname, '../test-fixtures/metro-app');
const BUNDLE_OUT = path.resolve(METRO_APP_DIR, 'bundle.js');

try {
  console.log('Building Metro bundle...');
  execSync(`npx metro build index.js --out ${BUNDLE_OUT} --platform ios --minify false`, {
    cwd: METRO_APP_DIR,
    stdio: 'inherit'
  });

  console.log('Bundle built successfully. Checking for web-only wallet SDKs...');
  const bundleContent = fs.readFileSync(BUNDLE_OUT, 'utf-8');

  // Assert it excludes Freighter and Albedo browser SDKs
  if (bundleContent.includes('@albedo-link/intent')) {
    console.error('ERROR: Bundle contains @albedo-link/intent');
    process.exit(1);
  }
  
  if (bundleContent.includes('@stellar/freighter-api')) {
    console.error('ERROR: Bundle contains @stellar/freighter-api');
    process.exit(1);
  }

  console.log('SUCCESS: Metro bundle is clean and does not contain web-only wallet SDKs.');
  process.exit(0);

} catch (error) {
  console.error('Metro bundle test failed:', error.message);
  process.exit(1);
}
