const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = {
  projectRoot,
  // Watch the whole monorepo so @cg/shared changes hot-reload
  watchFolders: [monorepoRoot],
  resolver: {
    // Resolve modules from local + monorepo root node_modules
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(monorepoRoot, 'node_modules'),
    ],
    // pnpm symlinks confuse Metro; disable hierarchical lookup
    disableHierarchicalLookup: true,
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
