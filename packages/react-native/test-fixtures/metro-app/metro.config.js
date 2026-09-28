const path = require('path');
const { getDefaultConfig } = require('metro-config');

module.exports = (async () => {
  const config = await getDefaultConfig();
  
  return {
    ...config,
    projectRoot: __dirname,
    resolver: {
      ...config.resolver,
      unstable_enablePackageExports: true,
      unstable_conditionNames: ['react-native', 'require', 'import'],
      nodeModulesPaths: [
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '../../../../node_modules')
      ],
      extraNodeModules: {
        '@use-stellar/react-native': path.resolve(__dirname, '../../'),
        'use-stellar': path.resolve(__dirname, '../../../core'),
        'url': path.resolve(__dirname, 'empty.js'),
        'events': path.resolve(__dirname, 'empty.js'),
        'https': path.resolve(__dirname, 'empty.js'),
        'http': path.resolve(__dirname, 'empty.js'),
        'util': path.resolve(__dirname, 'empty.js'),
        'metro-runtime/src/modules/asyncRequire': path.resolve(__dirname, 'empty.js')
      }
    },
    watchFolders: [
      path.resolve(__dirname, '../../../../')
    ]
  };
})();
