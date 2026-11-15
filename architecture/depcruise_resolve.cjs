/*
 * Resolve options for .dependency-cruiser.cjs, in the webpack shape that
 * dependency-cruiser reads (`options.webpackConfig`). Its own
 * `enhancedResolveOptions` schema has no `extensionAlias`, and without it
 * the `#models/*`-style subpath imports of package.json, which name `.js`
 * files whose sources are `.ts`, resolve to nothing (T-ARCH-001).
 */
module.exports = {
  resolve: {
    extensionAlias: { '.js': ['.ts', '.tsx', '.js'] },
    importsFields: ['imports'],
    exportsFields: ['exports'],
    conditionNames: ['import', 'require', 'node', 'default', 'types'],
    extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.d.ts'],
    mainFields: ['module', 'main', 'types', 'typings'],
  },
}
